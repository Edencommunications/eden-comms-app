// metaAds.ts — Meta (Facebook/Instagram) ads recaps posted into a community.
//
// Each org (Eden + every white label) connects its OWN Meta ad account:
// an access token + ad account id, stored zero-DDL in admin_settings
// (key 'meta_ads', one row per company). The admin picks which community
// the recaps post into and which cadences are on (daily / weekly / monthly).
//
// A scheduler (started from index.ts) checks every 15 minutes and, when a
// recap comes due, pulls the period's performance numbers AND the ad
// account's change-history log from the Meta Marketing API, has the
// Replit-managed AI write a short plain-English recap, and inserts it as a
// message in the chosen community. Failures never pass silently — the
// org's admins get a bell notification instead.
import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "node:crypto";
import { logger } from "../lib/logger";
import { notifyCommunityMembers } from "./communityPost";
import { requireStaff } from "./checkinForm";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const GRAPH = "https://graph.facebook.com/v21.0";

const SH = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function dbGet<T = any>(path: string): Promise<T[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: SH });
  if (!r.ok) return [];
  return r.json().catch(() => []) as Promise<T[]>;
}
async function dbInsert(table: string, body: any): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...SH, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  });
  return r.ok;
}

// ── Token encryption ────────────────────────────────────────────
// admin_settings rows are readable by every logged-in member of an org
// (RLS read policy), so the Meta token must NEVER be stored in plaintext.
// AES-256-GCM with a key derived from the server-only SESSION_SECRET —
// clients can see the ciphertext but can't do anything with it.
const ENC_KEY = crypto.createHash("sha256").update(`meta-ads-token:${process.env.SESSION_SECRET || ""}`).digest();

function encToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", ENC_KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `enc1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
}
function decToken(stored: string): string {
  try {
    if (!stored?.startsWith("enc1:")) return "";
    const [, ivB64, tagB64, ctB64] = stored.split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", ENC_KEY, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
  } catch { return ""; }
}

// ── Config storage (admin_settings key 'meta_ads', one per company) ──

type MetaCfg = {
  token: string;              // plaintext in memory only — stored as token_enc
  token_enc?: string;
  ad_account_id: string;      // digits only (we prepend act_)
  account_name?: string;
  community_id?: string | null;
  community_name?: string | null;
  daily?: boolean;
  weekly?: boolean;
  monthly?: boolean;
  hour?: number;              // UTC hour recaps post at (default 12 ≈ morning US)
  weekly_day?: number;        // 1 = Monday (default)
  connected_by?: string | null;
  connected_by_name?: string | null;
  last_daily?: string;        // YYYY-MM-DD markers so we never double-post
  last_weekly?: string;
  last_monthly?: string;      // YYYY-MM
};

// Raw stored value → parsed cfg with the token DECRYPTED for server use.
function parseCfg(raw: any): MetaCfg | null {
  try {
    const v = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!v) return null;
    if (v.token_enc) v.token = decToken(v.token_enc);
    return v;
  } catch { return null; }
}
// cfg → JSON string safe to store (token encrypted, plaintext stripped).
function serializeCfg(cfg: MetaCfg): string {
  const { token, ...rest } = cfg as any;
  if (token) rest.token_enc = encToken(token);
  return JSON.stringify(rest);
}

async function getCfg(companyId: string): Promise<MetaCfg | null> {
  const rows = await dbGet<any>(
    `admin_settings?company_id=eq.${encodeURIComponent(companyId)}&key=eq.meta_ads&select=value`,
  );
  if (!rows[0]) return null;
  return parseCfg(rows[0].value);
}
async function saveCfg(companyId: string, cfg: MetaCfg): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
    method: "POST",
    headers: { ...SH, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      company_id: companyId,
      key: "meta_ads",
      value: serializeCfg(cfg),
      updated_at: new Date().toISOString(),
    }),
  });
  return r.ok;
}
// Compare-and-swap update: only writes if the stored value is still exactly
// `expectedRaw`. Returns true if WE won the claim — the scheduler uses this
// so two server instances can never double-post the same recap.
async function casRaw(companyId: string, expectedRaw: string, newRaw: string): Promise<boolean> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${encodeURIComponent(companyId)}&key=eq.meta_ads&value=eq.${encodeURIComponent(expectedRaw)}`,
    {
      method: "PATCH",
      headers: { ...SH, Prefer: "return=representation" },
      body: JSON.stringify({ value: newRaw, updated_at: new Date().toISOString() }),
    },
  );
  if (!r.ok) return false;
  const rows = (await r.json().catch(() => [])) as any[];
  return Array.isArray(rows) && rows.length > 0;
}
async function casCfg(companyId: string, expectedRaw: string, cfg: MetaCfg): Promise<boolean> {
  return casRaw(companyId, expectedRaw, serializeCfg(cfg));
}

// ── Meta Graph API helpers ──────────────────────────────────────

async function metaGet(path: string, token: string): Promise<any | null> {
  try {
    const sep = path.includes("?") ? "&" : "?";
    const r = await fetch(`${GRAPH}/${path}${sep}access_token=${encodeURIComponent(token)}`);
    const b: any = await r.json().catch(() => null);
    if (!r.ok || b?.error) {
      logger.warn({ path: path.split("?")[0], err: b?.error?.message }, "[MetaAds] Graph API error");
      return null;
    }
    return b;
  } catch { return null; }
}

// Validate a token + account by asking Meta for the account's name.
async function validateAccount(token: string, adAccountId: string): Promise<{ ok: boolean; name?: string; error?: string }> {
  // Call Graph directly (not metaGet) so we can surface Meta's actual
  // error message to the admin instead of a generic guess.
  try {
    const r = await fetch(`${GRAPH}/act_${adAccountId}?fields=name,account_status&access_token=${encodeURIComponent(token)}`);
    const b: any = await r.json().catch(() => null);
    if (!r.ok || b?.error) {
      const msg = String(b?.error?.message || "").slice(0, 200);
      logger.warn({ path: `act_${adAccountId}`, err: msg }, "[MetaAds] Graph API error");
      return { ok: false, error: msg ? `Meta said: "${msg}" — this comes from Meta's side, not the app.` : "Meta rejected that token or ad account ID — double-check both and try again." };
    }
    return { ok: true, name: b.name || `Account ${adAccountId}` };
  } catch {
    return { ok: false, error: "Could not reach Meta — try again in a moment." };
  }
}

// "2026-08-07" → "August 7, 2026"
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${months[(m || 1) - 1]} ${d}, ${y}`;
};

const fmtUsd = (n: any) => {
  const v = Number(n);
  return Number.isFinite(v) ? `$${v.toFixed(2)}` : "—";
};

// Pull performance numbers for a date window (account level + top campaigns
// + per-ad numbers so every recap can rank best & worst ads).
async function pullInsights(cfg: MetaCfg, since: string, until: string, withAds = true) {
  const tr = encodeURIComponent(JSON.stringify({ since, until }));
  const acct = await metaGet(
    `act_${cfg.ad_account_id}/insights?time_range=${tr}&fields=spend,impressions,clicks,ctr,cpc,actions`,
    cfg.token,
  );
  const camps = await metaGet(
    `act_${cfg.ad_account_id}/insights?time_range=${tr}&level=campaign&fields=campaign_name,spend,actions&limit=25`,
    cfg.token,
  );
  const ads = withAds ? await metaGet(
    `act_${cfg.ad_account_id}/insights?time_range=${tr}&level=ad&fields=ad_name,campaign_name,spend,actions,clicks,impressions&limit=100`,
    cfg.token,
  ) : null;
  if (!acct) return null;
  const row = acct.data?.[0] || {};
  const leadCount = (actions: any[]) => {
    let n = 0;
    for (const a of actions || []) {
      if (["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"].includes(a.action_type)) n += Number(a.value) || 0;
    }
    return n;
  };
  const leads = leadCount(row.actions);
  const spend = Number(row.spend) || 0;
  return {
    spend, leads,
    impressions: Number(row.impressions) || 0,
    clicks: Number(row.clicks) || 0,
    ctr: row.ctr, cpc: row.cpc,
    cpl: leads > 0 ? spend / leads : null,
    campaigns: (camps?.data || []).map((c: any) => ({
      name: c.campaign_name, spend: Number(c.spend) || 0, leads: leadCount(c.actions),
    })).sort((a: any, b: any) => b.spend - a.spend),
    ads: (ads?.data || []).map((a: any) => {
      const sp = Number(a.spend) || 0, ld = leadCount(a.actions), ck = Number(a.clicks) || 0;
      return { name: a.ad_name, campaign: a.campaign_name, spend: sp, leads: ld,
        clicks: ck, views: Number(a.impressions) || 0,
        cpc: ck > 0 ? sp / ck : null, cpl: ld > 0 ? sp / ld : null };
    }).filter((a: any) => a.spend > 0).sort((x: any, y: any) => y.spend - x.spend),
  };
}

// Rank ads for best/worst callouts: best = lowest cost per lead among ads
// that got leads; worst = highest spend with no (or expensive) leads.
function rankAds(ads: any[]) {
  if (!ads?.length) return { best: [], worst: [] };
  const withLeads = ads.filter(a => a.cpl != null).sort((a, b) => a.cpl - b.cpl);
  const best = withLeads.slice(0, 3);
  const worstPool = ads.filter(a => !best.includes(a));
  const worst = worstPool.sort((a, b) => {
    const aBad = a.cpl == null ? a.spend * 1000 : a.cpl;
    const bBad = b.cpl == null ? b.spend * 1000 : b.cpl;
    return bBad - aBad;
  }).slice(0, 3);
  return { best, worst };
}

// Pull the change-history log (who changed what) for a date window.
async function pullChanges(cfg: MetaCfg, since: string, until: string) {
  const b = await metaGet(
    `act_${cfg.ad_account_id}/activities?since=${since}&until=${until}&fields=event_time,actor_name,application_name,translated_event_type,object_name&limit=100`,
    cfg.token,
  );
  return (b?.data || []).map((a: any) => ({
    when: a.event_time, who: a.actor_name || a.application_name || "Unknown",
    what: a.translated_event_type || "made a change", on: a.object_name || "",
  }));
}

// ── AI recap writer (Replit AI integration; plain fallback if AI fails) ──

async function writeRecap(period: "daily" | "weekly" | "monthly", orgName: string, since: string, until: string,
  cur: any, prev: any | null, changes: any[]): Promise<string> {
  const label = period === "daily" ? "DAILY" : period === "weekly" ? "WEEKLY" : "MONTHLY";
  const header = `📊 ${label} ADS RECAP\n${since === until ? fmtDate(since) : `${fmtDate(since)} → ${fmtDate(until)}`}\n━━━━━━━━━━━━━━━`;
  const ranked = rankAds(cur.ads || []);
  const facts = JSON.stringify({
    period, orgName, window: { since, until }, performance: { ...cur, ads: undefined },
    previous_period: prev ? { ...prev, ads: undefined, campaigns: undefined } : null,
    best_ads: ranked.best, worst_ads: ranked.worst, changes: changes.slice(0, 40),
  });

  const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (baseUrl && apiKey) {
    try {
      const r = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-5.6-luna",
          messages: [
            { role: "system", content: `You write ad-performance recaps for a coaching team's group chat. Plain language, no jargon. CRITICAL: output PLAIN TEXT only — no markdown (**, ##, tables render literally). Use this exact section layout, with a blank line between sections and "• " bullets:

💰 THE NUMBERS
• Spend: $X
• Leads: N ($X per lead)
• Clicks: N ($X per click)
• Views: N

📈 VS ${period === "daily" ? "YESTERDAY" : period === "weekly" ? "LAST WEEK" : "LAST MONTH"}
• one bullet per meaningful change (spend, leads, cost per lead, cost per click), each stating up/down and by how much (% or $). Say "about the same" when flat. Omit section if no previous data.

🏆 BEST PERFORMERS
• up to 3 ads from best_ads, each on TWO lines:
• AdName — $X per lead ($X spent)
   N views · N clicks ($X per click)

⚠️ NEEDS ATTENTION
• up to 3 ads from worst_ads, same two-line style, first line saying why (no leads despite $X spend, or high cost per lead)

🛠 WHAT CHANGED
• group by person: Name — what they changed (which campaign/ad). If none: "• No changes were made this period."

💡 TAKEAWAY
one sentence, actionable.

Never invent numbers not in the data. Round sensibly. Keep it under 250 words.` },
            { role: "user", content: facts },
          ],
        }),
      });
      const b: any = await r.json().catch(() => null);
      const text = b?.choices?.[0]?.message?.content?.trim();
      if (r.ok && text) return `${header}\n\n${text}`;
      logger.warn({ err: b?.error?.message }, "[MetaAds] AI recap failed — using plain format");
    } catch (e) { logger.warn({ err: String(e) }, "[MetaAds] AI recap failed — using plain format"); }
  }

  // Plain-format fallback — same section layout, real data, no AI required.
  const pct = (a: number, b: number) => (b > 0 ? `${a >= b ? "up" : "down"} ${Math.abs(Math.round(((a - b) / b) * 100))}%` : null);
  const lines = [
    header, "",
    "💰 THE NUMBERS",
    `• Spend: ${fmtUsd(cur.spend)}`,
    `• Leads: ${cur.leads}${cur.cpl != null ? ` (${fmtUsd(cur.cpl)} per lead)` : ""}`,
    `• Clicks: ${cur.clicks.toLocaleString()}${cur.clicks > 0 ? ` (${fmtUsd(cur.spend / cur.clicks)} per click)` : ""}`,
    `• Views: ${cur.impressions.toLocaleString()}`,
  ];
  if (prev) {
    const vsLabel = period === "daily" ? "YESTERDAY" : period === "weekly" ? "LAST WEEK" : "LAST MONTH";
    lines.push("", `📈 VS ${vsLabel}`);
    const sp = pct(cur.spend, prev.spend);
    lines.push(`• Spend ${sp || "—"} (${fmtUsd(prev.spend)} → ${fmtUsd(cur.spend)})`);
    lines.push(`• Leads: ${prev.leads} → ${cur.leads}`);
    if (cur.cpl != null && prev.cpl != null) lines.push(`• Cost per lead ${pct(cur.cpl, prev.cpl) || "about the same"} (${fmtUsd(prev.cpl)} → ${fmtUsd(cur.cpl)})`);
  }
  const adLine2 = (a: any) => `   ${(a.views || 0).toLocaleString()} views · ${a.clicks} clicks${a.cpc != null ? ` (${fmtUsd(a.cpc)} per click)` : ""}`;
  if (ranked.best.length) {
    lines.push("", "🏆 BEST PERFORMERS");
    for (const a of ranked.best) lines.push(`• ${a.name} — ${fmtUsd(a.cpl)} per lead (${fmtUsd(a.spend)} spent)`, adLine2(a));
  }
  if (ranked.worst.length) {
    lines.push("", "⚠️ NEEDS ATTENTION");
    for (const a of ranked.worst) lines.push(`• ${a.name} — ${a.cpl == null ? `no leads despite ${fmtUsd(a.spend)} spent` : `${fmtUsd(a.cpl)} per lead`}`, adLine2(a));
  }
  lines.push("", "🛠 WHAT CHANGED");
  if (!changes.length) lines.push("• No changes were made this period.");
  for (const ch of changes.slice(0, 15)) lines.push(`• ${ch.who} — ${ch.what}${ch.on ? ` (${ch.on})` : ""}`);
  if (changes.length > 15) lines.push(`• …and ${changes.length - 15} more changes.`);
  return lines.join("\n");
}

// ── Posting + failure alerts ────────────────────────────────────

// Returns true only when every intended admin got the notification (and at
// least one admin exists) — callers that must not lose an alert check this.
async function notifyAdmins(companyId: string, body: string): Promise<boolean> {
  const admins = await dbGet<any>(`user_profiles?company_id=eq.${encodeURIComponent(companyId)}&role=eq.super_admin&is_active=not.is.false&select=id`);
  let ok = admins.length > 0;
  for (const a of admins) {
    if (!(await dbInsert("notifications", { recipient_id: a.id, type: "meta_ads", body, is_read: false }))) ok = false;
  }
  return ok;
}

async function runRecap(companyId: string, cfg: MetaCfg, period: "daily" | "weekly" | "monthly"): Promise<{ ok: boolean; error?: string }> {
  if (!cfg.community_id) return { ok: false, error: "No community chosen for recaps yet." };
  // Re-validate the destination right before posting — it may have been
  // deleted or belong to a different org since settings were saved.
  const comm = await dbGet<any>(`communities?id=eq.${encodeURIComponent(cfg.community_id)}&company_id=eq.${encodeURIComponent(companyId)}&is_active=eq.true&select=id,name`);
  if (!comm[0]) {
    await notifyAdmins(companyId, "⚠️ Ads recaps are paused — the community they post into no longer exists. Pick a new one in the admin panel (Overview → Meta Ads Recaps).");
    return { ok: false, error: "The chosen community no longer exists — pick a new one." };
  }

  // Date windows (UTC). Daily = yesterday; weekly = last 7 full days;
  // monthly = previous calendar month. Each includes a previous window
  // so the recap can say better/worse.
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let since: string, until: string, pSince: string, pUntil: string;
  if (period === "daily") {
    const y = new Date(today.getTime() - 86400_000);
    since = until = day(y);
    const py = new Date(today.getTime() - 2 * 86400_000);
    pSince = pUntil = day(py);
  } else if (period === "weekly") {
    until = day(new Date(today.getTime() - 86400_000));
    since = day(new Date(today.getTime() - 7 * 86400_000));
    pUntil = day(new Date(today.getTime() - 8 * 86400_000));
    pSince = day(new Date(today.getTime() - 14 * 86400_000));
  } else {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const prevFirst = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    const prevPrevFirst = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 2, 1));
    since = day(prevFirst); until = day(new Date(first.getTime() - 86400_000));
    pSince = day(prevPrevFirst); pUntil = day(new Date(prevFirst.getTime() - 86400_000));
  }

  const cur = await pullInsights(cfg, since, until);
  if (!cur) {
    await notifyAdmins(companyId, "⚠️ The ads recap could not pull numbers from Meta — the access token may have expired. Reconnect Meta Ads in the admin panel (Overview → Ads Recaps).");
    return { ok: false, error: "Could not pull numbers from Meta — the token may have expired." };
  }
  const prev = await pullInsights(cfg, pSince, pUntil);
  const changes = await pullChanges(cfg, since, until);

  const orgs = await dbGet<any>(`companies?id=eq.${encodeURIComponent(companyId)}&select=name`);
  const text = await writeRecap(period, orgs?.[0]?.name || "our team", since, until, cur, prev, changes);

  const posted = await dbInsert("community_messages", {
    community_id: cfg.community_id,
    sender_id: cfg.connected_by || null,
    sender_name: "📊 Ads Recap",
    sender_role: "super_admin",
    content: text,
    parent_id: null,
  });
  if (!posted) {
    await notifyAdmins(companyId, "⚠️ The ads recap was generated but could not be posted to the chosen community. Check the community still exists in Overview → Ads Recaps.");
    return { ok: false, error: "Could not post into the community." };
  }
  // Ping community members so the recap shows in their bell + phone push.
  await notifyCommunityMembers(cfg.community_id, comm[0]?.name || "Ads", cfg.connected_by || null);
  return { ok: true };
}

const tokenFp = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex").slice(0, 12);
async function processDue() {
  // Token health first — it reads/writes its own fresh rows, so it can't
  // interfere with the recap claims below (which re-read afterwards).
  await checkTokenExpiries();
  try {
    const rows = await dbGet<any>(`admin_settings?key=eq.meta_ads&select=company_id,value`);
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const monthStr = todayStr.slice(0, 7);
    for (const row of rows) {
      const rawStored = typeof row.value === "string" ? row.value : JSON.stringify(row.value);
      const cfg = parseCfg(row.value);
      if (!cfg?.token || !cfg.ad_account_id || !cfg.community_id) continue;
      const hour = Number.isFinite(Number(cfg.hour)) ? Number(cfg.hour) : 12;
      if (now.getUTCHours() < hour) continue;

      const due: Array<"daily" | "weekly" | "monthly"> = [];
      if (cfg.daily && cfg.last_daily !== todayStr) due.push("daily");
      const weeklyDay = Number.isFinite(Number(cfg.weekly_day)) ? Number(cfg.weekly_day) : 1;
      if (cfg.weekly && now.getUTCDay() === weeklyDay && cfg.last_weekly !== todayStr) due.push("weekly");
      if (cfg.monthly && now.getUTCDate() === 1 && cfg.last_monthly !== monthStr) due.push("monthly");
      if (!due.length) continue;

      // Atomically CLAIM the periods before running (compare-and-swap on the
      // stored value) — if another server instance or overlapping pass got
      // there first, the swap finds different bytes and we skip. A crashing
      // run therefore can't double-post, and a failed claim never runs.
      if (due.includes("daily")) cfg.last_daily = todayStr;
      if (due.includes("weekly")) cfg.last_weekly = todayStr;
      if (due.includes("monthly")) cfg.last_monthly = monthStr;
      if (!(await casCfg(row.company_id, rawStored, cfg))) continue;

      for (const period of due) {
        const r = await runRecap(row.company_id, cfg, period);
        logger.info({ companyId: row.company_id, period, ok: r.ok, error: r.error }, "[MetaAds] scheduled recap");
        if (!r.ok) {
          // Roll the marker back (best-effort) so the next 15-min pass can
          // retry — but only up to 3 attempts per period per day, tracked in
          // the config, so a dead token can't spam admins with alerts.
          const fresh = await getCfg(row.company_id);
          if (fresh) {
            const attempts = (fresh as any)[`fails_${period}_${todayStr}`] = Number((fresh as any)[`fails_${period}_${todayStr}`] || 0) + 1;
            if (attempts < 3) {
              if (period === "daily") delete (fresh as any).last_daily;
              if (period === "weekly") delete (fresh as any).last_weekly;
              if (period === "monthly") delete (fresh as any).last_monthly;
            }
            // Prune old fail counters so the config doesn't grow forever
            for (const k of Object.keys(fresh)) {
              if (k.startsWith("fails_") && !k.endsWith(todayStr)) delete (fresh as any)[k];
            }
            await saveCfg(row.company_id, fresh);
          }
        }
      }
    }
  } catch (e) {
    logger.warn({ err: String(e) }, "[MetaAds] scheduler pass failed");
  }
}

export function startMetaAdsScheduler() {
  setTimeout(processDue, 30_000);          // first pass shortly after boot
  setInterval(processDue, 15 * 60 * 1000); // then every 15 minutes
}

// ── Routes (admin JWT; org-scoped) ──────────────────────────────

const router: IRouter = Router();

// Status for the caller's org — never echoes the token back.
router.get("/meta-ads/status", async (req: Request, res: Response) => {
  try {
    const caller = await requireStaff(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    const cfg = await getCfg(caller.company_id);
    if (!cfg?.token) { res.json({ ok: true, connected: false }); return; }
    res.json({
      ok: true, connected: true,
      account_name: cfg.account_name || null,
      ad_account_id: cfg.ad_account_id,
      community_id: cfg.community_id || null,
      community_name: cfg.community_name || null,
      daily: !!cfg.daily, weekly: !!cfg.weekly, monthly: !!cfg.monthly,
      hour: Number.isFinite(Number(cfg.hour)) ? Number(cfg.hour) : 12,
    });
  } catch { res.status(500).json({ error: "Status check failed" }); }
});

// Connect (admins only): validates the token + account against Meta first.
router.post("/meta-ads/connect", async (req: Request, res: Response) => {
  try {
    const caller = await requireStaff(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    if (caller.role !== "super_admin") { res.status(403).json({ error: "Only admins can connect Meta Ads" }); return; }
    const token = String(req.body?.token || "").trim();
    const adAccountId = String(req.body?.adAccountId || "").trim().replace(/^act_/, "");
    if (!token || !adAccountId) { res.status(400).json({ error: "Paste both the access token and the ad account ID" }); return; }
    if (!/^\d+$/.test(adAccountId)) { res.status(400).json({ error: "The ad account ID should be just numbers (with or without the act_ prefix)" }); return; }
    const v = await validateAccount(token, adAccountId);
    if (!v.ok) { res.status(400).json({ error: v.error }); return; }
    const prev = (await getCfg(caller.company_id)) || ({} as MetaCfg);
    const names = await dbGet<any>(`user_profiles?id=eq.${caller.id}&select=name`);
    const cfg: MetaCfg = {
      ...prev, token, ad_account_id: adAccountId, account_name: v.name,
      connected_by: caller.id, connected_by_name: names?.[0]?.name || null,
      hour: Number.isFinite(Number(prev.hour)) ? Number(prev.hour) : 12,
    };
    // Fresh token ⇒ new fingerprint, so the expiry warnings naturally re-arm.
    if (!(await saveCfg(caller.company_id, cfg))) { res.status(502).json({ error: "Could not save the connection" }); return; }
    res.json({ ok: true, account_name: v.name });
  } catch { res.status(500).json({ error: "Could not connect Meta Ads" }); }
});

// Disconnect (admins only).
router.post("/meta-ads/disconnect", async (req: Request, res: Response) => {
  try {
    const caller = await requireStaff(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    if (caller.role !== "super_admin") { res.status(403).json({ error: "Only admins can disconnect Meta Ads" }); return; }
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${caller.company_id}&key=eq.meta_ads`,
      { method: "DELETE", headers: SH },
    );
    if (!r.ok) { res.status(502).json({ error: "Could not disconnect" }); return; }
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not disconnect" }); }
});

// Save destination + cadences (admins only). Community must belong to the org.
router.post("/meta-ads/settings", async (req: Request, res: Response) => {
  try {
    const caller = await requireStaff(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    if (caller.role !== "super_admin") { res.status(403).json({ error: "Only admins can change recap settings" }); return; }
    const cfg = await getCfg(caller.company_id);
    if (!cfg?.token) { res.status(400).json({ error: "Connect Meta Ads first" }); return; }
    const communityId = String(req.body?.communityId || "").trim();
    if (communityId) {
      const rows = await dbGet<any>(`communities?id=eq.${encodeURIComponent(communityId)}&company_id=eq.${caller.company_id}&is_active=eq.true&select=id,name`);
      if (!rows[0]) { res.status(400).json({ error: "That community wasn't found in your organization" }); return; }
      cfg.community_id = rows[0].id;
      cfg.community_name = rows[0].name;
    }
    if (req.body?.daily !== undefined) cfg.daily = !!req.body.daily;
    if (req.body?.weekly !== undefined) cfg.weekly = !!req.body.weekly;
    if (req.body?.monthly !== undefined) cfg.monthly = !!req.body.monthly;
    if (req.body?.hour !== undefined) {
      const h = Number(req.body.hour);
      if (!Number.isInteger(h) || h < 0 || h > 23) { res.status(400).json({ error: "Post hour must be 0–23" }); return; }
      cfg.hour = h;
    }
    if (!(await saveCfg(caller.company_id, cfg))) { res.status(502).json({ error: "Could not save settings" }); return; }
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not save settings" }); }
});

// Post a recap right now (admins only) — lets the user test without waiting.
router.post("/meta-ads/run-now", async (req: Request, res: Response) => {
  try {
    const caller = await requireStaff(req);
    if (!caller) { res.status(401).json({ error: "Not authorized" }); return; }
    if (caller.role !== "super_admin") { res.status(403).json({ error: "Only admins can post a test recap" }); return; }
    const period = String(req.body?.period || "daily") as "daily" | "weekly" | "monthly";
    if (!["daily", "weekly", "monthly"].includes(period)) { res.status(400).json({ error: "Bad period" }); return; }
    const cfg = await getCfg(caller.company_id);
    if (!cfg?.token) { res.status(400).json({ error: "Connect Meta Ads first" }); return; }
    const r = await runRecap(caller.company_id, cfg, period);
    if (!r.ok) { res.status(400).json({ error: r.error || "Recap failed" }); return; }
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not run the recap" }); }
});

export default router;

async function checkTokenExpiries() {
  const rows = await dbGet<any>(`admin_settings?key=eq.meta_ads&select=company_id,value`);
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  for (const row of rows) {
    try {
      const rawStored = typeof row.value === "string" ? row.value : JSON.stringify(row.value);
      const cfg = parseCfg(row.value);
      if (!cfg?.token) continue;
      const c = cfg as any;
      if (c.last_token_check === todayStr) continue;

      // Atomically claim today's check (same CAS trick as recaps) so two
      // server instances can't both notify. We keep the exact bytes we wrote
      // so every later write can be a CAS against them — if an admin
      // reconnects (or anything else changes the row) mid-check, our update
      // loses the swap and we abandon it instead of clobbering fresh config.
      c.last_token_check = todayStr;
      const claimedRaw = serializeCfg(cfg);
      if (!(await casRaw(row.company_id, rawStored, claimedRaw))) continue;
      const finish = async (mutate: (o: any) => void): Promise<boolean> => {
        const next: any = { ...(cfg as any) };
        mutate(next);
        const won = await casRaw(row.company_id, claimedRaw, serializeCfg(next));
        if (!won) logger.info({ companyId: row.company_id }, "[MetaAds] config changed mid-check — leaving it untouched");
        return won;
      };

      const info = await debugToken(cfg.token);
      if (!info) {
        // Meta unreachable — release today's claim so the next 15-min pass
        // retries, bounded to 3 attempts per day.
        await finish((o) => {
          const f = Number(o.token_check_fails || 0) + 1;
          o.token_check_fails = f;
          if (f < 3) delete o.last_token_check;
        });
        continue;
      }

      const fp = tokenFp(cfg.token);
      const expired = !info.valid ||
        (info.expiresAt != null && info.expiresAt > 0 && info.expiresAt * 1000 <= now.getTime());
      const daysLeft = !expired && info.expiresAt != null && info.expiresAt > 0
        ? Math.floor((info.expiresAt * 1000 - now.getTime()) / 86400_000)
        : null;

      let notice: string | null = null;
      let flag: string | null = null;
      if (expired && c.warned_expired_fp !== fp) {
        notice = "⚠️ Your Meta Ads connection has expired — ads recaps can't post until you reconnect. Get a fresh access token and reconnect in the admin panel (Overview → Ads Recaps).";
        flag = "warned_expired_fp";
      } else if (!expired && daysLeft != null && daysLeft <= 7 && c.warned_expiring_fp !== fp) {
        const when = fmtDate(new Date(info.expiresAt! * 1000).toISOString().slice(0, 10));
        notice = `⏳ Your Meta Ads connection expires in ${daysLeft <= 0 ? "less than a day" : `${daysLeft} day${daysLeft === 1 ? "" : "s"}`} (${when}). Reconnect with a fresh access token in the admin panel (Overview → Ads Recaps) so recaps don't get missed.`;
        flag = "warned_expiring_fp";
      }
      if (!notice || !flag) {
        // Nothing to send today — clear any stale retry counters (CAS-guarded).
        if (c.token_warn_fails || c.token_check_fails) {
          await finish((o) => { delete o.token_warn_fails; delete o.token_check_fails; });
        }
        continue;
      }

      const delivered = await notifyAdmins(row.company_id, notice);
      const flagName = flag, fpVal = fp;
      if (delivered) {
        // Only mark "warned" once every admin actually got the bell —
        // otherwise a transient DB hiccup would silently swallow the
        // warning forever for this token. CAS-guarded: if an admin
        // reconnected mid-check the swap loses and nothing is clobbered
        // (the new token has a new fingerprint, so warnings re-arm anyway).
        await finish((o) => {
          o[flagName] = fpVal;
          delete o.token_warn_fails;
          delete o.token_check_fails;
        });
        logger.info({ companyId: row.company_id, expired, daysLeft }, "[MetaAds] token expiry warning sent");
      } else {
        // Delivery failed: release today's claim so the next 15-min pass
        // retries, bounded to 3 attempts per day so a broken notifications
        // table can't loop forever.
        await finish((o) => {
          const fails = Number(o.token_warn_fails || 0) + 1;
          o.token_warn_fails = fails;
          if (fails < 3) delete o.last_token_check;
        });
        logger.warn({ companyId: row.company_id }, "[MetaAds] token expiry warning delivery failed");
      }
    } catch (e) {
      logger.warn({ companyId: row?.company_id, err: String(e) }, "[MetaAds] token check failed");
    }
  }
}

async function debugToken(token: string): Promise<{ valid: boolean; expiresAt: number | null } | null> {
  try {
    const t = encodeURIComponent(token);
    const r = await fetch(`${GRAPH}/debug_token?input_token=${t}&access_token=${t}`);
    const b: any = await r.json().catch(() => null);
    const d = b?.data;
    if (d && typeof d.is_valid === "boolean") {
      // expires_at is unix seconds; 0 means "never expires".
      const exp = Number(d.expires_at);
      return { valid: d.is_valid, expiresAt: Number.isFinite(exp) ? exp : null };
    }
    // An OAuth error on the call itself means the token is already dead.
    if (b?.error?.code === 190) return { valid: false, expiresAt: null };
    return null;
  } catch { return null; }
}
