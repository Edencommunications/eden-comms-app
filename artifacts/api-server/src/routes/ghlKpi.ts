// ghlKpi.ts — Weekly GoHighLevel KPI reports posted into a community.
//
// Works per organization:
//   • Eden HQ connects via the server-only GHL_PIT_TOKEN secret (never in
//     the database) with built-in defaults for pipelines/stages/calendars.
//   • White-label orgs connect their OWN GoHighLevel location by pasting a
//     Private Integration Token + Location ID; the token is stored
//     AES-256-GCM encrypted in admin_settings (rows are org-readable under
//     RLS, so plaintext is never stored) — same pattern as metaAds.ts.
//
// Each org picks its own lead pipelines, closed-deal stages, setter
// calendar, closer calendars, commission rate, community, time zone, post
// day and hour. On the configured weekday the scheduler pulls the previous
// full Mon–Sun week (in the org's time zone) — new leads, setter calls,
// closing calls, closed deals and their dollar values — computes closer
// commissions (weekly + month-to-date), and posts a plain-English report.
// On the configured day of month it posts a commission payout report
// covering the previous calendar month.
//
// Reliability pattern shared with metaAds.ts: config + markers in
// admin_settings (key 'ghl_kpi', one row per org), CAS-claimed markers so
// two server instances can't double-post (dev and prod share the DB),
// marker rollback with a 3-try cap on failure, admin bell alerts instead
// of silent failures, raw payloads archived for history, and an evaluated
// /healthz entry. The weekly dedupe marker is the reported week's start
// date in the org's time zone — never "today" — so UTC midnight or a post
// day change can't repost a week that already went out.
import crypto from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { notifyCommunityMembers } from "./communityPost";
import { requireStaff } from "./checkinForm";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const EDEN_COMPANY_ID = "b0000000-0000-0000-0000-000000000001";
const GHL_BASE = "https://services.leadconnectorhq.com";

const EDEN_LOCATION_ID = "kuKtKnNy2D1k5hVocBdJ";
const isEden = (cid: string) => cid === EDEN_COMPANY_ID;

// ── Eden's built-in defaults (used until Eden admins customize) ──
const EDEN_LEAD_PIPELINES = [
  "New Lead",
  "Application Pipeline",
  "Workshop Pipeline",
  "Clients",
  "University Mentees",
];
const EDEN_CLOSED_STAGES: Array<{ pipeline: string; stage: string }> = [
  { pipeline: "Application Pipeline", stage: "Deposit Paid" },
  { pipeline: "Clients", stage: "Foundation" },
  { pipeline: "Clients", stage: "Launch" },
  { pipeline: "Clients", stage: "Scale" },
];
const EDEN_SETTER_CALENDAR = { id: "1z14MTqpliMfJXqIWwd5", name: "Complimentary Call" };
const EDEN_CLOSER_CALENDARS = [
  { id: "XRg1BpwuMU53M1moK62C", name: "Lauren Sedlar Calendar" },
  { id: "NeVnLNtJd5L98Mc2fhtl", name: "Martin Nwakamma Calendar" },
];
const DEFAULT_RATE = 0.15;
const DEFAULT_TZ = "America/Chicago";

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
async function dbUpsertSetting(companyId: string, key: string, value: string): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
    method: "POST",
    headers: { ...SH, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      company_id: companyId,
      key,
      value,
      updated_at: new Date().toISOString(),
    }),
  });
  return r.ok;
}

// ── Token encryption (metaAds pattern) ──────────────────────────
// admin_settings rows are readable by every logged-in member of an org, so
// PIT tokens are stored AES-256-GCM encrypted with a server-only key.
const ENC_KEY = crypto.createHash("sha256").update(`ghl-kpi-token:${process.env.SESSION_SECRET || ""}`).digest();
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

// ── Config (admin_settings key 'ghl_kpi', one row per org) ──────

type GhlCfg = {
  // Connection (white-label orgs only — Eden uses the env secret).
  token_enc?: string;
  location_id?: string;
  // Reporting setup.
  community_id?: string | null;
  community_name?: string | null;
  weekly?: boolean;
  payout?: boolean;
  tz?: string;               // IANA time zone (default America/Chicago)
  hour?: number;             // LEGACY: UTC hour (pre-timezone configs)
  hour_local?: number;       // post hour in the org's own time zone
  weekly_dow?: number;       // weekday for the weekly post (0=Sun … 6=Sat, default 1=Mon)
  payout_day?: number;       // day-of-month for the payout post (1–28, default 15)
  lead_pipelines?: string[]; // pipeline NAMES counted as leads
  closed_stages?: Array<{ pipeline: string; stage: string }>;
  setter_calendar?: { id: string; name: string } | null; // null = no setter section
  closers?: Array<{ id: string; name: string }>;          // closer calendars
  commission_rate?: number;  // fraction, e.g. 0.15
  last_weekly?: string;      // reported week's start date (org-tz) — dedupe marker
  last_payout?: string;      // YYYY-MM marker (org-tz month)
  closer_names?: Record<string, string>; // GHL userId → display name cache
  connected_by?: string | null;
};

function validTz(tz: any): string | null {
  if (typeof tz !== "string" || !tz.trim()) return null;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return tz; } catch { return null; }
}
export function tzOf(cfg: GhlCfg): string { return validTz(cfg.tz) || DEFAULT_TZ; }
function rateOf(cfg: GhlCfg): number {
  const r = Number(cfg.commission_rate);
  return Number.isFinite(r) && r > 0 && r <= 1 ? r : DEFAULT_RATE;
}
// The org's GHL connection, or null when not connected.
function connOf(cfg: GhlCfg, companyId: string): { token: string; locationId: string } | null {
  if (isEden(companyId)) {
    const t = process.env.GHL_PIT_TOKEN || "";
    return t ? { token: t, locationId: EDEN_LOCATION_ID } : null;
  }
  const t = decToken(cfg.token_enc || "");
  const l = String(cfg.location_id || "").trim();
  return t && l ? { token: t, locationId: l } : null;
}
function leadPipelinesOf(cfg: GhlCfg, companyId: string): string[] {
  const list = Array.isArray(cfg.lead_pipelines) ? cfg.lead_pipelines.filter((p) => typeof p === "string" && p.trim()) : [];
  return list.length ? list : (isEden(companyId) ? EDEN_LEAD_PIPELINES : []);
}
function closedStagesOf(cfg: GhlCfg, companyId: string): Array<{ pipeline: string; stage: string }> {
  const list = Array.isArray(cfg.closed_stages)
    ? cfg.closed_stages.filter((s) => s && typeof s.pipeline === "string" && typeof s.stage === "string")
    : [];
  return list.length ? list : (isEden(companyId) ? EDEN_CLOSED_STAGES : []);
}
function setterOf(cfg: GhlCfg, companyId: string): { id: string; name: string } | null {
  if (cfg.setter_calendar === null) return null; // explicitly disabled
  if (cfg.setter_calendar && cfg.setter_calendar.id) return cfg.setter_calendar;
  return isEden(companyId) ? EDEN_SETTER_CALENDAR : null;
}
// Closer calendar list — customizable, Eden falls back to the built-in default.
export function closersOf(cfg: GhlCfg, companyId: string = EDEN_COMPANY_ID): Array<{ id: string; name: string }> {
  const list = Array.isArray(cfg.closers)
    ? cfg.closers.filter((c) => c && typeof c.id === "string" && c.id.trim())
    : [];
  return list.length ? list : (isEden(companyId) ? EDEN_CLOSER_CALENDARS : []);
}
// Human display name for a closer calendar ("Lauren Sedlar Calendar" → "Lauren Sedlar").
const closerDisplay = (name: string) =>
  String(name || "").replace(/\s*calendar\s*$/i, "").trim() || name;

// What's still missing before reports can run for this org (null = ready).
function readyError(cfg: GhlCfg, companyId: string): string | null {
  if (!connOf(cfg, companyId)) {
    return isEden(companyId)
      ? "The GHL connection is missing on the server (GHL_PIT_TOKEN)."
      : "Connect your GoHighLevel account first (token + location ID).";
  }
  if (!cfg.community_id) return "No community chosen for KPI reports yet.";
  if (!closersOf(cfg, companyId).length) return "Add at least one closer calendar.";
  if (!leadPipelinesOf(cfg, companyId).length) return "Choose at least one lead pipeline.";
  return null;
}

async function getCfgRow(companyId: string): Promise<{ raw: string; cfg: GhlCfg } | null> {
  const rows = await dbGet<any>(
    `admin_settings?company_id=eq.${encodeURIComponent(companyId)}&key=eq.ghl_kpi&select=value`,
  );
  if (!rows[0]) return null;
  const raw = typeof rows[0].value === "string" ? rows[0].value : JSON.stringify(rows[0].value);
  let cfg: GhlCfg = {};
  try { cfg = JSON.parse(raw) || {}; } catch { /* keep empty */ }
  return { raw, cfg };
}
async function getCfg(companyId: string): Promise<GhlCfg> {
  return (await getCfgRow(companyId))?.cfg || {};
}
async function saveCfg(companyId: string, cfg: GhlCfg): Promise<boolean> {
  return dbUpsertSetting(companyId, "ghl_kpi", JSON.stringify(cfg));
}
// Compare-and-swap: only writes if the stored bytes are unchanged, so two
// server instances (dev + prod share this DB) can never double-post.
async function casCfg(companyId: string, expectedRaw: string, cfg: GhlCfg): Promise<boolean> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${encodeURIComponent(companyId)}&key=eq.ghl_kpi&value=eq.${encodeURIComponent(expectedRaw)}`,
    {
      method: "PATCH",
      headers: { ...SH, Prefer: "return=representation" },
      body: JSON.stringify({ value: JSON.stringify(cfg), updated_at: new Date().toISOString() }),
    },
  );
  if (!r.ok) return false;
  const rows = (await r.json().catch(() => [])) as any[];
  return Array.isArray(rows) && rows.length > 0;
}
// Safe read-modify-write: re-fetches fresh bytes and applies `fn` under CAS,
// retrying on conflict. Every writer (settings saves, name-cache persistence,
// failure rollback) must go through this — a plain whole-config save can
// clobber another instance's markers and cause duplicate posts.
async function mutateCfg(companyId: string, fn: (cfg: GhlCfg) => void, tries = 3): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    const row = await getCfgRow(companyId);
    if (!row) {
      const cfg: GhlCfg = {};
      fn(cfg);
      if (await saveCfg(companyId, cfg)) return true;
      continue;
    }
    fn(row.cfg);
    if (await casCfg(companyId, row.raw, row.cfg)) return true;
  }
  return false;
}

// ── GHL API (retry/backoff, pagination) ─────────────────────────

type Conn = { token: string; locationId: string };

async function ghlGet(conn: Conn, path: string): Promise<any> {
  const headers = {
    Authorization: `Bearer ${conn.token}`,
    Version: "2021-07-28",
    Accept: "application/json",
  };
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`${GHL_BASE}${path}`, { headers });
      if (r.status === 429 || r.status >= 500) {
        lastErr = `HTTP ${r.status}`;
        await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
        continue;
      }
      const b: any = await r.json().catch(() => null);
      if (!r.ok) throw new Error(`GHL ${r.status}: ${String(b?.message || "").slice(0, 120)}`);
      return b;
    } catch (e: any) {
      lastErr = String(e?.message || e);
      if (attempt === 2) break;
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
    }
  }
  throw new Error(`GHL request failed (${path.split("?")[0]}): ${lastErr}`);
}

// All opportunities in one pipeline (paginated — never silently truncates).
// The final count is checked against GHL's own meta.total so an API paging
// quirk can't quietly drop records from a KPI report.
async function fetchPipelineOpps(conn: Conn, pipelineId: string): Promise<any[]> {
  const out: any[] = [];
  let expectedTotal: number | null = null;
  for (let page = 1; page <= 50; page++) {
    const b = await ghlGet(conn,
      `/opportunities/search?location_id=${conn.locationId}&pipeline_id=${pipelineId}&limit=100&page=${page}`,
    );
    const rows = Array.isArray(b?.opportunities) ? b.opportunities : [];
    out.push(...rows);
    const total = Number(b?.meta?.total);
    if (Number.isFinite(total)) expectedTotal = total;
    if (rows.length < 100) {
      if (expectedTotal != null && out.length < expectedTotal) {
        throw new Error(`Pipeline ${pipelineId}: got ${out.length} of ${expectedTotal} opportunities — refusing to report on incomplete data.`);
      }
      return out;
    }
  }
  throw new Error(`Pipeline ${pipelineId} has more than 5,000 opportunities — refusing to truncate.`);
}

async function fetchCalendarEvents(conn: Conn, calendarId: string, startMs: number, endMs: number): Promise<any[]> {
  const b = await ghlGet(conn,
    `/calendars/events?locationId=${conn.locationId}&calendarId=${calendarId}&startTime=${startMs}&endTime=${endMs}`,
  );
  return Array.isArray(b?.events) ? b.events : [];
}

// GHL userId → human name (cached in config; falls back to short id).
async function resolveCloserName(conn: Conn, userId: string, cache: Record<string, string>): Promise<string> {
  if (!userId) return "Unassigned";
  if (cache[userId]) return cache[userId];
  try {
    const b = await ghlGet(conn, `/users/${userId}`);
    const name = String(b?.name || `${b?.firstName || ""} ${b?.lastName || ""}`.trim() || "").trim();
    if (name) { cache[userId] = name; return name; }
  } catch { /* fall through */ }
  return `Closer …${userId.slice(-4)}`;
}

// ── Pure calculation helpers (exported for tests) ───────────────

export type Windows = {
  weekStart: string; weekEnd: string;       // previous Mon–Sun (org-tz dates)
  weekStartMs: number; weekEndMs: number;   // [start, end) — org-tz midnights as real instants
  mtdStart: string; mtdStartMs: number;     // 1st of current org-tz month → now
};

// Week/month boundaries must be midnights in the ORG'S time zone (a deal
// closed 11pm Sunday locally belongs to that week, even though it's
// already Monday in UTC). Default: US Central (Eden's zone).
const CENTRAL_TZ = DEFAULT_TZ;

// Calendar date (y, m0, d) + weekday + hour in the given time zone.
export function centralDateParts(now: Date, tz: string = CENTRAL_TZ): { y: number; m0: number; d: number; dow: number; hour: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, year: "numeric", month: "numeric", day: "numeric", weekday: "short", hour: "numeric", hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(now)) parts[p.type] = p.value;
  const dow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(parts.weekday || "");
  return { y: Number(parts.year), m0: Number(parts.month) - 1, d: Number(parts.day), dow, hour: Number(parts.hour) % 24 };
}

// The real UTC instant of midnight on a given calendar date in the given
// time zone. Two-pass offset lookup so DST transition days resolve correctly.
export function centralMidnightMs(y: number, m0: number, d: number, tz: string = CENTRAL_TZ): number {
  const offsetAt = (ms: number) => {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric", hour12: false,
    });
    const p: Record<string, string> = {};
    for (const part of fmt.formatToParts(new Date(ms))) p[part.type] = part.value;
    const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day),
      Number(p.hour) % 24, Number(p.minute), Number(p.second));
    return wall - ms; // negative west of Greenwich
  };
  let guess = Date.UTC(y, m0, d, 6); // rough guess
  guess = Date.UTC(y, m0, d) - offsetAt(guess);
  return Date.UTC(y, m0, d) - offsetAt(guess);
}

const isoOf = (y: number, m0: number, d: number) =>
  new Date(Date.UTC(y, m0, d)).toISOString().slice(0, 10);
const dayIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Given "now", the reporting week is the last FULL Mon–Sun (org-tz) before today.
export function computeWindows(now: Date, tz: string = CENTRAL_TZ): Windows {
  const c = centralDateParts(now, tz);
  const daysSinceMonday = (c.dow + 6) % 7; // Monday → 0
  // Walk back on the calendar via a UTC-noon anchor (DST-safe).
  const anchor = Date.UTC(c.y, c.m0, c.d, 12);
  const dateNDaysBack = (n: number) => {
    const t = new Date(anchor - n * 86400_000);
    return { y: t.getUTCFullYear(), m0: t.getUTCMonth(), d: t.getUTCDate() };
  };
  const mon = dateNDaysBack(daysSinceMonday + 7); // previous week's Monday
  const nextMon = dateNDaysBack(daysSinceMonday); // this week's Monday (exclusive end)
  const sun = dateNDaysBack(daysSinceMonday + 1); // previous week's Sunday (label)
  return {
    weekStart: isoOf(mon.y, mon.m0, mon.d),
    weekEnd: isoOf(sun.y, sun.m0, sun.d),
    weekStartMs: centralMidnightMs(mon.y, mon.m0, mon.d, tz),
    weekEndMs: centralMidnightMs(nextMon.y, nextMon.m0, nextMon.d, tz),
    mtdStart: isoOf(c.y, c.m0, 1),
    mtdStartMs: centralMidnightMs(c.y, c.m0, 1, tz),
  };
}

// Previous calendar month [start, end) in the org's time zone.
export function payoutWindow(now: Date, tz: string = CENTRAL_TZ): { label: string; startMs: number; endMs: number } {
  const c = centralDateParts(now, tz);
  const prev = new Date(Date.UTC(c.y, c.m0 - 1, 1));
  const py = prev.getUTCFullYear(), pm0 = prev.getUTCMonth();
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return {
    label: `${months[pm0]} ${py}`,
    startMs: centralMidnightMs(py, pm0, 1, tz),
    endMs: centralMidnightMs(c.y, c.m0, 1, tz),
  };
}

export type Deal = { id: string; name: string; value: number; closer: string; whenMs: number; contactId: string };

export type GhlTransaction = {
  id: string;
  contactId: string;
  amount: number;          // in whole dollars (GHL returns dollars, not cents)
  amountRefunded: number;  // partial-refund amount on a succeeded tx
  status: "succeeded" | "refunded" | "failed" | string;
  createdAt: string;       // ISO — when the payment was made
  updatedAt: string;       // ISO — when last updated (i.e. when refund was issued)
};
export function dealsInRange(deals: Deal[], startMs: number, endMs: number): Deal[] {
  return deals.filter((d) => d.whenMs >= startMs && d.whenMs < endMs);
}
export function commissionByCloser(deals: Deal[], rate: number = DEFAULT_RATE): Array<{ name: string; sales: number; commission: number; deals: number }> {
  const map = new Map<string, { sales: number; deals: number }>();
  for (const d of deals) {
    const cur = map.get(d.closer) || { sales: 0, deals: 0 };
    cur.sales += d.value; cur.deals += 1;
    map.set(d.closer, cur);
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, sales: v.sales, commission: v.sales * rate, deals: v.deals }))
    .sort((a, b) => b.sales - a.sales);
}

export type CashCloserRow = {
  name: string;
  collected: number;        // net cash in period (can be negative on heavy refunds)
  commission: number;       // collected × COMMISSION_RATE
  txCount: number;          // number of payments attributed
};
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctLabel = (rate: number) => {
  const p = rate * 100;
  return Number.isInteger(p) ? String(p) : p.toFixed(1);
};
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${months[(m || 1) - 1]} ${d}, ${y}`;
};

export type WeeklyPayload = {
  week_start: string; week_end: string;
  leads: number;
  setter_calls_booked: number; setter_calls_showed: number;
  setter_label?: string;   // calendar name; section hidden when include_setter is false
  include_setter?: boolean;
  closing_calls_booked: number; closing_calls_showed: number;
  closer_label?: string;   // e.g. "Lauren + Martin" — from the configured closer calendars
  commission_pct?: string; // e.g. "15" — org's configured rate
  // Contracted (deal-value) commissions
  closed_deals: number; total_amount: number;
  commissions_by_closer: Array<{ name: string; sales: number; commission: number; deals: number }>;
  total_commissions: number;
  // Collected-cash commissions
  cash_by_closer: CashCloserRow[];
  total_cash_commissions: number;
  total_cash_collected: number;
  mtd: {
    start: string;
    closed_deals: number; total_amount: number;
    commissions_by_closer: Array<{ name: string; sales: number; commission: number; deals: number }>;
    total_commissions: number;
    // MTD collected-cash
    cash_by_closer: CashCloserRow[];
    total_cash_commissions: number;
    total_cash_collected: number;
  };
};

export function buildWeeklyMessage(p: WeeklyPayload): string {
  const lines = [
    "📈 WEEKLY KPI REPORT",
    `${fmtDate(p.week_start)} → ${fmtDate(p.week_end)}`,
    "━━━━━━━━━━━━━━━",
    "",
    "🧲 LEADS",
    `• New leads: ${p.leads}`,
  ];
  if (p.include_setter !== false) {
    lines.push(
      "",
      `📞 SETTER CALLS (${p.setter_label || "Complimentary Call"})`,
      `• Booked: ${p.setter_calls_booked}`,
      `• Showed: ${p.setter_calls_showed}`,
    );
  }
  lines.push(
    "",
    `🤝 CLOSING CALLS${p.closer_label ? ` (${p.closer_label})` : ""}`,
    `• Booked: ${p.closing_calls_booked}`,
    `• Showed: ${p.closing_calls_showed}`,
    "",
    "💰 CLOSED DEALS (CONTRACTED)",
    `• Deals closed: ${p.closed_deals}`,
    `• Contracted revenue: ${usd(p.total_amount)}`,
  );

  // ── Contracted (deal-value) commissions ──
  lines.push("", `📋 CONTRACTED COMMISSIONS (${p.commission_pct || "15"}% of deal values) — THIS WEEK`);
  if (p.commissions_by_closer.length) {
    for (const c of p.commissions_by_closer) {
      lines.push(`• ${c.name}: ${usd(c.commission)} (${c.deals} deal${c.deals === 1 ? "" : "s"}, ${usd(c.sales)} contracted)`);
    }
    lines.push(`• Team total: ${usd(p.total_commissions)}`);
  } else {
    lines.push("• No closed deals this week.");
  }

  // ── Collected-cash commissions ──
  lines.push("", `💵 COLLECTED COMMISSIONS (${p.commission_pct || "15"}% of cash received) — THIS WEEK`);
  if (p.cash_by_closer.length) {
    for (const c of p.cash_by_closer) {
      lines.push(`• ${c.name}: ${usd(c.commission)} (${c.txCount} payment${c.txCount === 1 ? "" : "s"}, ${usd(c.collected)} collected)`);
    }
    lines.push(`• Team total: ${usd(p.total_cash_commissions)} on ${usd(p.total_cash_collected)} collected`);
  } else {
    lines.push("• No attributed payments received this week.");
  }

  // ── MTD ──
  lines.push("", `📆 MONTH TO DATE (since ${fmtDate(p.mtd.start)})`);
  lines.push(`• Contracted: ${p.mtd.closed_deals} deal${p.mtd.closed_deals === 1 ? "" : "s"} · ${usd(p.mtd.total_amount)}`);
  if (p.mtd.commissions_by_closer.length) {
    for (const c of p.mtd.commissions_by_closer) lines.push(`• ${c.name}: ${usd(c.commission)} contracted commission`);
    lines.push(`• Team contracted total: ${usd(p.mtd.total_commissions)}`);
  }
  lines.push("");
  if (p.mtd.cash_by_closer.length) {
    lines.push(`• Collected: ${usd(p.mtd.total_cash_collected)} · Cash commissions owed: ${usd(p.mtd.total_cash_commissions)}`);
    for (const c of p.mtd.cash_by_closer) lines.push(`• ${c.name}: ${usd(c.commission)} cash commission so far`);
  } else {
    lines.push("• No attributed payments received MTD.");
  }

  return lines.join("\n");
}

export function buildPayoutMessage(
  label: string,
  deals: Deal[],
  cashRows: CashCloserRow[],
  totalCashCollected: number,
  payoutDay = 15,
  rate: number = DEFAULT_RATE,
): string {
  const byCloser = commissionByCloser(deals, rate);
  const contractedTotal = byCloser.reduce((s, c) => s + c.commission, 0);
  const contractedSales = byCloser.reduce((s, c) => s + c.sales, 0);
  const cashTotal = cashRows.reduce((s, c) => s + c.commission, 0);
  const suffix = payoutDay === 1 ? "st" : payoutDay === 2 ? "nd" : payoutDay === 3 ? "rd" : payoutDay === 21 ? "st" : payoutDay === 22 ? "nd" : payoutDay === 23 ? "rd" : "th";

  const lines = [
    "💵 COMMISSION PAYOUT REPORT",
    `${label} — payable on the ${payoutDay}${suffix}`,
    "━━━━━━━━━━━━━━━",
    "",
    "💰 COLLECTED CASH (basis for payout)",
  ];

  if (cashRows.length) {
    for (const c of cashRows) {
      lines.push(`• ${c.name}: ${usd(c.commission)} (${pctLabel(rate)}% of ${usd(c.collected)} · ${c.txCount} payment${c.txCount === 1 ? "" : "s"})`);
    }
    lines.push(`• Team total to pay: ${usd(cashTotal)} on ${usd(totalCashCollected)} collected`);
  } else {
    lines.push(`• No attributed payments received in ${label}.`);
  }

  lines.push("", "📋 CONTRACTED REVENUE (deal values — for reference)");
  if (byCloser.length) {
    for (const c of byCloser) {
      lines.push(`• ${c.name}: ${usd(c.sales)} contracted (${c.deals} deal${c.deals === 1 ? "" : "s"}, ${usd(c.commission)} at ${pctLabel(rate)}%)`);
    }
    lines.push(`• Team contracted: ${usd(contractedSales)} · ${usd(contractedTotal)} at ${pctLabel(rate)}%`);
  } else {
    lines.push(`• No deals were closed in ${label}.`);
  }

  return lines.join("\n");
}

async function fetchAllTransactions(conn: Conn): Promise<GhlTransaction[]> {
  const out: GhlTransaction[] = [];
  let expectedTotal: number | null = null;
  for (let page = 1; page <= 50; page++) {
    const b = await ghlGet(conn,
      `/payments/transactions?altId=${conn.locationId}&altType=location&limit=100&pageNo=${page}`,
    );
    const total = Number(b?.totalCount);
    if (Number.isFinite(total) && total >= 0) expectedTotal = total;
    const rows: any[] = Array.isArray(b?.data) ? b.data : [];
    for (const r of rows) {
      if (!r?.contactId) continue; // can't attribute without a contact
      out.push({
        id: String(r._id || r.id || ""),
        contactId: String(r.contactId),
        amount: Number(r.amount) || 0,
        amountRefunded: Number(r.amountRefunded) || 0,
        status: String(r.status || ""),
        createdAt: String(r.createdAt || ""),
        updatedAt: String(r.updatedAt || ""),
      });
    }
    // `nextPage` is null when there are no more pages.
    if (!b?.nextPage || rows.length < 100) {
      if (expectedTotal != null && out.length < expectedTotal) {
        throw new Error(
          `Payment transactions: got ${out.length} of ${expectedTotal} — refusing to report on incomplete data.`,
        );
      }
      return out;
    }
  }
  throw new Error("More than 5,000 payment transactions — refusing to truncate.");
}
async function resolvePipelines(conn: Conn, leadNames: string[], closedStageNames: Array<{ pipeline: string; stage: string }>): Promise<{
  leadPipelineIds: string[];
  closedStages: Array<{ pipelineId: string; stageId: string }>;
  missing: string[];
}> {
  const b = await ghlGet(conn, `/opportunities/pipelines?locationId=${conn.locationId}`);
  const pipelines: any[] = Array.isArray(b?.pipelines) ? b.pipelines : [];
  const byName = new Map(pipelines.map((p) => [String(p.name).trim().toLowerCase(), p]));
  const missing: string[] = [];
  const leadPipelineIds: string[] = [];
  for (const name of leadNames) {
    const p = byName.get(name.toLowerCase());
    if (p) leadPipelineIds.push(p.id); else missing.push(`pipeline "${name}"`);
  }
  const closedStages: Array<{ pipelineId: string; stageId: string }> = [];
  for (const cs of closedStageNames) {
    const p = byName.get(cs.pipeline.toLowerCase());
    const stage = (p?.stages || []).find((s: any) => String(s.name).trim().toLowerCase() === cs.stage.toLowerCase());
    if (p && stage) closedStages.push({ pipelineId: p.id, stageId: stage.id });
    else missing.push(`stage "${cs.stage}" in "${cs.pipeline}"`);
  }
  return { leadPipelineIds, closedStages, missing };
}

const isBooked = (ev: any) => !["cancelled", "invalid", "noshow_cancelled"].includes(String(ev.appointmentStatus || "").toLowerCase());
const isShowed = (ev: any) => String(ev.appointmentStatus || "").toLowerCase() === "showed";

// Full pull for a weekly report. Throws with a section-specific message on
// failure so the alert can say exactly which part broke.
async function pullWeekData(companyId: string, cfg: GhlCfg, conn: Conn, w: Windows) {
  const { leadPipelineIds, closedStages, missing } = await resolvePipelines(
    conn, leadPipelinesOf(cfg, companyId), closedStagesOf(cfg, companyId),
  );
  if (missing.length) throw new Error(`GHL setup changed — could not find: ${missing.join(", ")}.`);

  // Opportunities for every relevant pipeline, fetched once each.
  const pipelineIds = [...new Set([...leadPipelineIds, ...closedStages.map((c) => c.pipelineId)])];
  const oppsByPipeline = new Map<string, any[]>();
  for (const pid of pipelineIds) oppsByPipeline.set(pid, await fetchPipelineOpps(conn, pid));

  // 1. Leads — created inside the week, across the lead pipelines.
  let leads = 0;
  for (const pid of leadPipelineIds) {
    for (const o of oppsByPipeline.get(pid) || []) {
      const t = Date.parse(o.createdAt || "");
      if (Number.isFinite(t) && t >= w.weekStartMs && t < w.weekEndMs) leads++;
    }
  }

  // 2–3. Appointments.
  const setter = setterOf(cfg, companyId);
  const setterEvents = setter ? await fetchCalendarEvents(conn, setter.id, w.weekStartMs, w.weekEndMs) : [];
  let closingBooked = 0, closingShowed = 0;
  for (const cal of closersOf(cfg, companyId)) {
    const evs = await fetchCalendarEvents(conn, cal.id, w.weekStartMs, w.weekEndMs);
    closingBooked += evs.filter(isBooked).length;
    closingShowed += evs.filter(isShowed).length;
  }

  // 4–6. Closed deals (all-time list; callers slice by window). Stage-entry
  // time = lastStageChangeAt (falls back to updatedAt/createdAt when GHL
  // omits it). contactId is carried so transaction cash can be attributed.
  const closerCache = cfg.closer_names || {};
  const allDeals: Deal[] = [];
  const stageSet = new Set(closedStages.map((c) => `${c.pipelineId}:${c.stageId}`));
  for (const pid of [...new Set(closedStages.map((c) => c.pipelineId))]) {
    for (const o of oppsByPipeline.get(pid) || []) {
      if (!stageSet.has(`${pid}:${o.pipelineStageId}`)) continue;
      const t = Date.parse(o.lastStageChangeAt || o.lastStatusChangeAt || o.updatedAt || o.createdAt || "");
      if (!Number.isFinite(t)) continue;
      allDeals.push({
        id: o.id,
        name: String(o.name || "Unnamed"),
        value: Number(o.monetaryValue) || 0,
        closer: await resolveCloserName(conn, String(o.assignedTo || ""), closerCache),
        whenMs: t,
        contactId: String(o.contactId || o.contact?.id || ""),
      });
    }
  }
  cfg.closer_names = closerCache;

  // 7. Payment transactions — full history, filtered in-code by callers.
  // A fetch failure throws here: the caller's try/catch will notify admins
  // and trigger the scheduler retry so we never post a silently-empty cash
  // section on a payout report or misleading zero on a weekly report.
  const allTransactions = await fetchAllTransactions(conn);

  return {
    leads,
    setter_label: setter?.name,
    include_setter: !!setter,
    setter_calls_booked: setterEvents.filter(isBooked).length,
    setter_calls_showed: setterEvents.filter(isShowed).length,
    closing_calls_booked: closingBooked,
    closing_calls_showed: closingShowed,
    allDeals,
    allTransactions,
  };
}

// ── Posting ─────────────────────────────────────────────────────

async function notifyAdmins(companyId: string, body: string): Promise<void> {
  const admins = await dbGet<any>(`user_profiles?company_id=eq.${encodeURIComponent(companyId)}&role=eq.super_admin&is_active=not.is.false&select=id`);
  for (const a of admins) {
    await dbInsert("notifications", { recipient_id: a.id, type: "ghl_kpi", body, is_read: false });
  }
}

async function postToCommunity(companyId: string, cfg: GhlCfg, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!cfg.community_id) return { ok: false, error: "No community chosen for KPI reports yet." };
  const comm = await dbGet<any>(`communities?id=eq.${encodeURIComponent(cfg.community_id)}&company_id=eq.${encodeURIComponent(companyId)}&is_active=eq.true&select=id,name`);
  if (!comm[0]) {
    await notifyAdmins(companyId, "⚠️ Weekly KPI reports are paused — the community they post into no longer exists. Pick a new one in the admin panel (Overview → GHL KPI Reports).");
    return { ok: false, error: "The chosen community no longer exists — pick a new one." };
  }
  const posted = await dbInsert("community_messages", {
    community_id: cfg.community_id,
    sender_id: cfg.connected_by || null,
    sender_name: "📈 KPI Report",
    sender_role: "super_admin",
    content: text,
    parent_id: null,
  });
  if (!posted) {
    await notifyAdmins(companyId, "⚠️ The weekly KPI report was generated but could not be posted to the chosen community. Check Overview → GHL KPI Reports.");
    return { ok: false, error: "Could not post into the community." };
  }
  await notifyCommunityMembers(cfg.community_id, comm[0]?.name || "KPIs", cfg.connected_by || null);
  return { ok: true };
}

// `asOf` pins the reported window to the moment the scheduler CLAIMED the
// report — a long GHL pull crossing local midnight must not shift the
// window away from the dedupe marker that was claimed for it.
async function runWeekly(companyId: string, cfg: GhlCfg, asOf: Date = new Date()): Promise<{ ok: boolean; error?: string }> {
  const notReady = readyError(cfg, companyId);
  if (notReady) return { ok: false, error: notReady };
  const conn = connOf(cfg, companyId)!;
  const tz = tzOf(cfg);
  const rate = rateOf(cfg);
  const now = asOf;
  const w = computeWindows(now, tz);
  let data;
  try {
    data = await pullWeekData(companyId, cfg, conn, w);
  } catch (e: any) {
    const msg = String(e?.message || e).slice(0, 300);
    await notifyAdmins(companyId, `⚠️ The weekly KPI report could not pull data from GoHighLevel: ${msg}`);
    return { ok: false, error: msg };
  }
  const weekDeals = dealsInRange(data.allDeals, w.weekStartMs, w.weekEndMs);
  const mtdDeals = dealsInRange(data.allDeals, w.mtdStartMs, now.getTime());
  const weekComm = commissionByCloser(weekDeals, rate);
  const mtdComm = commissionByCloser(mtdDeals, rate);

  // Cash commissions: build a contact→closer map from ALL closed deals
  // (no time-filter), then attribute payment transactions to closers.
  const contactCloserMap = buildContactCloserMap(data.allDeals);
  const weekCash = cashCommissionByCloser(data.allTransactions, contactCloserMap, w.weekStartMs, w.weekEndMs);
  const mtdCash = cashCommissionByCloser(data.allTransactions, contactCloserMap, w.mtdStartMs, now.getTime());

  const payload: WeeklyPayload = {
    week_start: w.weekStart, week_end: w.weekEnd,
    leads: data.leads,
    setter_label: data.setter_label,
    include_setter: data.include_setter,
    setter_calls_booked: data.setter_calls_booked,
    setter_calls_showed: data.setter_calls_showed,
    closing_calls_booked: data.closing_calls_booked,
    closing_calls_showed: data.closing_calls_showed,
    closer_label: closersOf(cfg, companyId).map((c) => closerDisplay(c.name).split(" ")[0]).join(" + "),
    commission_pct: pctLabel(rate),
    closed_deals: weekDeals.length,
    total_amount: weekDeals.reduce((s, d) => s + d.value, 0),
    commissions_by_closer: weekComm,
    total_commissions: weekComm.reduce((s, c) => s + c.commission, 0),
    cash_by_closer: weekCash,
    total_cash_commissions: weekCash.reduce((s, c) => s + c.commission, 0),
    total_cash_collected: weekCash.reduce((s, c) => s + c.collected, 0),
    mtd: {
      start: w.mtdStart,
      closed_deals: mtdDeals.length,
      total_amount: mtdDeals.reduce((s, d) => s + d.value, 0),
      commissions_by_closer: mtdComm,
      total_commissions: mtdComm.reduce((s, c) => s + c.commission, 0),
      cash_by_closer: mtdCash,
      total_cash_commissions: mtdCash.reduce((s, c) => s + c.commission, 0),
      total_cash_collected: mtdCash.reduce((s, c) => s + c.collected, 0),
    },
  };
  const r = await postToCommunity(companyId, cfg, buildWeeklyMessage(payload));
  if (r.ok) {
    // Persist the raw payload for history (best-effort; the post already went).
    await dbUpsertSetting(companyId, `ghl_kpi_hist:${w.weekStart}`, JSON.stringify(payload));
    await persistCloserNames(companyId, cfg.closer_names || {});
  }
  return r;
}

async function runPayout(companyId: string, cfg: GhlCfg, asOf: Date = new Date()): Promise<{ ok: boolean; error?: string }> {
  const notReady = readyError(cfg, companyId);
  if (notReady) return { ok: false, error: notReady };
  const conn = connOf(cfg, companyId)!;
  const tz = tzOf(cfg);
  const rate = rateOf(cfg);
  const now = asOf;
  const pw = payoutWindow(now, tz);
  let data;
  try {
    data = await pullWeekData(companyId, cfg, conn, computeWindows(now, tz)); // reuse: allDeals + allTransactions are all-time
  } catch (e: any) {
    const msg = String(e?.message || e).slice(0, 300);
    await notifyAdmins(companyId, `⚠️ The monthly commission payout report could not pull data from GoHighLevel: ${msg}`);
    return { ok: false, error: msg };
  }
  const deals = dealsInRange(data.allDeals, pw.startMs, pw.endMs);
  const contactCloserMap = buildContactCloserMap(data.allDeals);
  const cashRows = cashCommissionByCloser(data.allTransactions, contactCloserMap, pw.startMs, pw.endMs);
  const totalCashCollected = cashRows.reduce((s, c) => s + c.collected, 0);
  const payoutDay = Number.isInteger(cfg.payout_day) && cfg.payout_day! >= 1 && cfg.payout_day! <= 28 ? cfg.payout_day! : 15;

  const r = await postToCommunity(companyId, cfg, buildPayoutMessage(pw.label, deals, cashRows, totalCashCollected, payoutDay, rate));
  if (r.ok) {
    await dbUpsertSetting(companyId, `ghl_kpi_payout:${dayIso(pw.startMs).slice(0, 7)}`, JSON.stringify({
      month: pw.label,
      // Cash-collected commissions (the payout basis)
      cash_by_closer: cashRows,
      total_cash_collected: totalCashCollected,
      total_cash_commissions: cashRows.reduce((s, c) => s + c.commission, 0),
      // Deal-value commissions (reference)
      commissions_by_closer: commissionByCloser(deals, rate),
      deals: deals.map((d) => ({ name: d.name, value: d.value, closer: d.closer, when: dayIso(d.whenMs) })),
    }));
    await persistCloserNames(companyId, cfg.closer_names || {});
  }
  return r;
}

// Merge newly-resolved closer names into a FRESH copy of the config — the
// long GHL pull means our in-memory cfg may be stale, and writing it back
// whole would clobber markers or settings an admin changed mid-run.
async function persistCloserNames(companyId: string, names: Record<string, string>): Promise<void> {
  if (!Object.keys(names).length) return;
  await mutateCfg(companyId, (cfg) => {
    cfg.closer_names = { ...(cfg.closer_names || {}), ...names };
  });
}

// ── Scheduler + health ──────────────────────────────────────────

const health = {
  lastPassAt: 0,
  lastPassOk: true,
  lastError: "" as string,
  configured: false,
};

export function getGhlKpiHealth() {
  const staleMs = 60 * 60 * 1000; // scheduler runs every 15 min — 1h grace
  const stale = health.lastPassAt > 0 && Date.now() - health.lastPassAt > staleMs;
  const started = health.lastPassAt > 0;
  return {
    healthy: !health.configured || (started && !stale && health.lastPassOk),
    configured: health.configured,
    lastPassAt: health.lastPassAt ? new Date(health.lastPassAt).toISOString() : null,
    lastError: health.lastError || null,
    stale,
  };
}

// Post-hour gate in the org's own time zone. Legacy configs stored a UTC
// hour; honor it until the org saves a local hour.
function hourGatePassed(cfg: GhlCfg, now: Date, tzHourNow: number): boolean {
  if (Number.isInteger(cfg.hour_local) && cfg.hour_local! >= 0 && cfg.hour_local! <= 23) {
    return tzHourNow >= cfg.hour_local!;
  }
  const legacy = Number.isFinite(Number(cfg.hour)) ? Number(cfg.hour) : 11;
  return now.getUTCHours() >= legacy;
}

async function processOrg(companyId: string, cfg: GhlCfg): Promise<void> {
  if (!cfg.weekly && !cfg.payout) return;
  if (readyError(cfg, companyId)) return; // not fully set up yet — nothing to do
  const now = new Date();
  const tz = tzOf(cfg);
  const parts = centralDateParts(now, tz);
  if (!hourGatePassed(cfg, now, parts.hour)) return;

  // Post day and payout day are judged on the ORG's calendar. Markers are
  // org-tz based too: the weekly marker is the REPORTED WEEK's start date
  // (not "today"), so crossing UTC midnight during one local day — or
  // changing the post day mid-week — can never repost a week that already
  // went out. The payout marker is the org-tz month.
  const localToday = isoOf(parts.y, parts.m0, parts.d);
  const localMonth = localToday.slice(0, 7);
  const weekKey = computeWindows(now, tz).weekStart;
  const weeklyDow = Number.isInteger(cfg.weekly_dow) && cfg.weekly_dow! >= 0 && cfg.weekly_dow! <= 6 ? cfg.weekly_dow! : 1;
  const payoutDay = Number.isInteger(cfg.payout_day) && cfg.payout_day! >= 1 && cfg.payout_day! <= 28 ? cfg.payout_day! : 15;
  const due: Array<"weekly" | "payout"> = [];
  if (cfg.weekly && parts.dow === weeklyDow && cfg.last_weekly !== weekKey) due.push("weekly");
  if (cfg.payout && parts.d === payoutDay && cfg.last_payout !== localMonth) due.push("payout");
  if (!due.length) return;

  for (const kind of due) {
    // Claim EACH report separately with its own CAS on fresh bytes — a
    // shared claim would let one report's rollback resurrect (or erase)
    // the other's marker when both land on the same day.
    const row = await getCfgRow(companyId);
    if (!row) return;
    const freshCfg = row.cfg;
    // Re-check the marker on fresh bytes (another instance may have run it).
    if (kind === "weekly") {
      if (!freshCfg.weekly || freshCfg.last_weekly === weekKey) continue;
      freshCfg.last_weekly = weekKey;
    } else {
      if (!freshCfg.payout || freshCfg.last_payout === localMonth) continue;
      freshCfg.last_payout = localMonth;
    }
    if (!(await casCfg(companyId, row.raw, freshCfg))) continue; // lost the claim — skip

    // Pass the claim-time `now` so the reported window always matches the
    // marker we just claimed, even if the GHL pull crosses local midnight.
    const r = kind === "weekly" ? await runWeekly(companyId, freshCfg, now) : await runPayout(companyId, freshCfg, now);
    logger.info({ companyId, kind, ok: r.ok, error: r.error }, "[GhlKpi] scheduled report");
    if (!r.ok) {
      health.lastPassOk = false;
      health.lastError = `${companyId.slice(0, 8)}…: ${r.error || "report failed"}`;
      // Roll only THIS report's marker back (up to 3 tries per day) so the
      // next 15-min pass retries; admins were already alerted by the run.
      await mutateCfg(companyId, (rollback) => {
        const failKey = `fails_${kind}_${localToday}`;
        const attempts = Number((rollback as any)[failKey] || 0) + 1;
        (rollback as any)[failKey] = attempts;
        if (attempts < 3) {
          // Only roll back OUR OWN claim — if the marker has since moved to
          // a different week/month (another instance or a later period),
          // deleting it would let that other report post twice.
          if (kind === "weekly" && rollback.last_weekly === weekKey) delete rollback.last_weekly;
          if (kind === "payout" && rollback.last_payout === localMonth) delete rollback.last_payout;
        }
        for (const k of Object.keys(rollback)) {
          if (k.startsWith("fails_") && !k.endsWith(localToday)) delete (rollback as any)[k];
        }
      });
    }
  }
}

async function processDue() {
  try {
    const rows = await dbGet<any>(`admin_settings?key=eq.ghl_kpi&select=company_id,value`);
    health.lastPassAt = Date.now();
    health.lastPassOk = true;
    health.lastError = "";
    let anyConfigured = false;
    for (const row of rows) {
      const companyId = String(row.company_id || "");
      if (!companyId) continue;
      let cfg: GhlCfg = {};
      try { cfg = (typeof row.value === "string" ? JSON.parse(row.value) : row.value) || {}; } catch { continue; }
      if ((cfg.weekly || cfg.payout) && !readyError(cfg, companyId)) anyConfigured = true;
      try {
        await processOrg(companyId, cfg);
      } catch (e) {
        health.lastPassOk = false;
        health.lastError = `${companyId.slice(0, 8)}…: ${String(e).slice(0, 150)}`;
        logger.warn({ companyId, err: String(e) }, "[GhlKpi] org pass failed");
      }
    }
    health.configured = anyConfigured;
  } catch (e) {
    health.lastPassOk = false;
    health.lastError = String(e).slice(0, 200);
    logger.warn({ err: String(e) }, "[GhlKpi] scheduler pass failed");
  }
}

export function startGhlKpiScheduler() {
  setTimeout(processDue, 45_000);          // first pass shortly after boot
  setInterval(processDue, 15 * 60 * 1000); // then every 15 minutes
}

// ── Routes (each org's super admins manage their own setup) ─────

const router: IRouter = Router();

async function requireOrgAdmin(req: Request, res: Response) {
  const caller = await requireStaff(req);
  if (!caller) { res.status(401).json({ error: "Not authorized" }); return null; }
  if (caller.role !== "super_admin" || !caller.company_id) {
    res.status(403).json({ error: "Only organization admins can manage KPI reports" });
    return null;
  }
  return caller;
}

// Strict integer parsing — Number("") is 0, which would silently turn a
// malformed empty input into "Sunday" or "midnight".
const intParam = (v: any): number | null => {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return Number(v.trim());
  return null;
};

// Exported for unit testing: parse the scalar (non-DB) fields of a settings
// POST body into (cfg: GhlCfg) => void mutators or an error string.
// Community-id, closers-list, setter-calendar, pipelines/stages (which
// require DB or GHL API calls) are NOT included and handled by the route
// handler separately.
export function parseGhlKpiSettingsBody(body: Record<string, unknown>): {
  setters: Array<(cfg: GhlCfg) => void>;
  error?: string;
} {
  const setters: Array<(cfg: GhlCfg) => void> = [];
  if (body.weekly !== undefined) { const v = !!body.weekly; setters.push((cfg) => { cfg.weekly = v; }); }
  if (body.payout !== undefined) { const v = !!body.payout; setters.push((cfg) => { cfg.payout = v; }); }
  if (body.hourLocal !== undefined) {
    const h = intParam(body.hourLocal);
    if (h === null || h < 0 || h > 23) return { setters: [], error: "Post hour must be 0–23" };
    setters.push((cfg) => { cfg.hour_local = h; delete cfg.hour; });
  }
  if (body.weeklyDow !== undefined) {
    const d = intParam(body.weeklyDow);
    if (d === null || d < 0 || d > 6) return { setters: [], error: "Weekly post day must be 0 (Sunday) to 6 (Saturday)" };
    setters.push((cfg) => { cfg.weekly_dow = d; });
  }
  if (body.payoutDay !== undefined) {
    const d = intParam(body.payoutDay);
    if (d === null || d < 1 || d > 28) return { setters: [], error: "Payout day must be 1–28" };
    setters.push((cfg) => { cfg.payout_day = d; });
  }
  return { setters };
}

router.get("/ghl-kpi/status", async (req: Request, res: Response) => {
  try {
    const caller = await requireOrgAdmin(req, res);
    if (!caller) return;
    const cid = caller.company_id;
    const cfg = await getCfg(cid);
    const tz = tzOf(cfg);
    // Present a local hour even for legacy UTC-hour configs.
    let hourLocal = Number.isInteger(cfg.hour_local) ? Number(cfg.hour_local) : null;
    if (hourLocal === null) {
      const legacyUtc = Number.isFinite(Number(cfg.hour)) ? Number(cfg.hour) : 11;
      const probe = new Date();
      probe.setUTCHours(legacyUtc, 30, 0, 0);
      hourLocal = centralDateParts(probe, tz ?? undefined).hour;
    }
    res.json({
      ok: true,
      is_eden: isEden(cid),
      connected: !!connOf(cfg, cid),
      location_id: isEden(cid) ? null : (cfg.location_id || null),
      community_id: cfg.community_id || null,
      community_name: cfg.community_name || null,
      weekly: !!cfg.weekly,
      payout: !!cfg.payout,
      tz,
      hour_local: hourLocal,
      weekly_dow: Number.isInteger(cfg.weekly_dow) && cfg.weekly_dow! >= 0 && cfg.weekly_dow! <= 6 ? cfg.weekly_dow : 1,
      payout_day: Number.isInteger(cfg.payout_day) && cfg.payout_day! >= 1 && cfg.payout_day! <= 28 ? cfg.payout_day : 15,
      lead_pipelines: leadPipelinesOf(cfg, cid),
      closed_stages: closedStagesOf(cfg, cid),
      setter_calendar: setterOf(cfg, cid),
      closers: closersOf(cfg, cid),
      commission_pct: Math.round(rateOf(cfg) * 1000) / 10,
      ready_error: readyError(cfg, cid),
    });
  } catch { res.status(500).json({ error: "Status check failed" }); }
});

// White-label orgs connect their own GHL location. Validated live before
// saving; the token is stored encrypted.
router.post("/ghl-kpi/connect", async (req: Request, res: Response) => {
  try {
    const caller = await requireOrgAdmin(req, res);
    if (!caller) return;
    if (isEden(caller.company_id)) { res.status(400).json({ error: "Eden's GHL connection is built in" }); return; }
    const token = String(req.body?.token || "").trim();
    const locationId = String(req.body?.locationId || "").trim();
    if (!token || token.length < 20) { res.status(400).json({ error: "Paste the Private Integration Token from GoHighLevel" }); return; }
    if (!locationId || !/^[A-Za-z0-9]{10,40}$/.test(locationId)) { res.status(400).json({ error: "Paste your GHL Location ID (Settings → Business Profile)" }); return; }
    // Prove the pair works before saving anything.
    try {
      await ghlGet({ token, locationId }, `/opportunities/pipelines?locationId=${locationId}`);
    } catch (e: any) {
      res.status(400).json({ error: `GoHighLevel rejected that token/location: ${String(e?.message || e).slice(0, 160)}` });
      return;
    }
    const enc = encToken(token);
    const saved = await mutateCfg(caller.company_id, (cfg) => {
      cfg.token_enc = enc;
      cfg.location_id = locationId;
      if (!cfg.connected_by) cfg.connected_by = caller.id;
    });
    if (!saved) { res.status(502).json({ error: "Could not save the connection" }); return; }
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not connect" }); }
});

router.post("/ghl-kpi/disconnect", async (req: Request, res: Response) => {
  try {
    const caller = await requireOrgAdmin(req, res);
    if (!caller) return;
    if (isEden(caller.company_id)) { res.status(400).json({ error: "Eden's GHL connection is built in" }); return; }
    const saved = await mutateCfg(caller.company_id, (cfg) => {
      delete cfg.token_enc;
      delete cfg.location_id;
      cfg.weekly = false;
      cfg.payout = false;
    });
    if (!saved) { res.status(502).json({ error: "Could not disconnect" }); return; }
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not disconnect" }); }
});

// Everything the setup pickers need: the org's pipelines (with stages) and
// active calendars, straight from their GHL account.
router.get("/ghl-kpi/options", async (req: Request, res: Response) => {
  try {
    const caller = await requireOrgAdmin(req, res);
    if (!caller) return;
    const cfg = await getCfg(caller.company_id);
    const conn = connOf(cfg, caller.company_id);
    if (!conn) { res.status(400).json({ error: "Connect GoHighLevel first" }); return; }
    const [pb, cb] = await Promise.all([
      ghlGet(conn, `/opportunities/pipelines?locationId=${conn.locationId}`),
      ghlGet(conn, `/calendars/?locationId=${conn.locationId}`),
    ]);
    const pipelines = (Array.isArray(pb?.pipelines) ? pb.pipelines : []).map((p: any) => ({
      name: String(p.name || ""),
      stages: (Array.isArray(p.stages) ? p.stages : []).map((s: any) => String(s.name || "")).filter(Boolean),
    })).filter((p: any) => p.name);
    const calendars = (Array.isArray(cb?.calendars) ? cb.calendars : [])
      .filter((c: any) => c?.isActive !== false)
      .map((c: any) => ({ id: String(c.id), name: String(c.name || c.id) }))
      .sort((a: any, b2: any) => a.name.localeCompare(b2.name));
    res.json({ ok: true, pipelines, calendars });
  } catch { res.status(502).json({ error: "Could not load your GoHighLevel setup" }); }
});

router.post("/ghl-kpi/settings", async (req: Request, res: Response) => {
  try {
    const caller = await requireOrgAdmin(req, res);
    if (!caller) return;
    const cid = caller.company_id;
    // Validate everything up front, then apply as a field-merge under CAS so
    // an admin save can never clobber a scheduler's just-claimed marker.
    const setters: Array<(cfg: GhlCfg) => void> = [];
    const communityId = String(req.body?.communityId || "").trim();
    if (communityId) {
      const rows = await dbGet<any>(`communities?id=eq.${encodeURIComponent(communityId)}&company_id=eq.${encodeURIComponent(cid)}&is_active=eq.true&select=id,name`);
      if (!rows[0]) { res.status(400).json({ error: "That community wasn't found" }); return; }
      setters.push((cfg) => { cfg.community_id = rows[0].id; cfg.community_name = rows[0].name; });
    }
    if (req.body?.weekly !== undefined) { const v = !!req.body.weekly; setters.push((cfg) => { cfg.weekly = v; }); }
    if (req.body?.payout !== undefined) { const v = !!req.body.payout; setters.push((cfg) => { cfg.payout = v; }); }
    if (req.body?.tz !== undefined) {
      const tz = validTz(req.body.tz);
      if (!tz) { res.status(400).json({ error: "That time zone isn't recognized" }); return; }
      setters.push((cfg) => { cfg.tz = tz; });
    }
    if (req.body?.hourLocal !== undefined) {
      const h = intParam(req.body.hourLocal);
      if (h === null || h < 0 || h > 23) { res.status(400).json({ error: "Post hour must be 0–23" }); return; }
      setters.push((cfg) => { cfg.hour_local = h; delete cfg.hour; });
    }
    if (req.body?.weeklyDow !== undefined) {
      const d = intParam(req.body.weeklyDow);
      if (d === null || d < 0 || d > 6) { res.status(400).json({ error: "Weekly post day must be 0 (Sunday) to 6 (Saturday)" }); return; }
      setters.push((cfg) => { cfg.weekly_dow = d; });
    }
    if (req.body?.payoutDay !== undefined) {
      const d = intParam(req.body.payoutDay);
      if (d === null || d < 1 || d > 28) { res.status(400).json({ error: "Payout day must be 1–28" }); return; }
      setters.push((cfg) => { cfg.payout_day = d; });
    }
    if (req.body?.commissionPct !== undefined) {
      const p = Number(req.body.commissionPct);
      if (!Number.isFinite(p) || p <= 0 || p > 100) { res.status(400).json({ error: "Commission must be between 0 and 100 percent" }); return; }
      const rate = Math.round(p * 10) / 1000; // one decimal of a percent
      setters.push((cfg) => { cfg.commission_rate = rate; });
    }
    if (req.body?.leadPipelines !== undefined) {
      if (!Array.isArray(req.body.leadPipelines) || req.body.leadPipelines.length > 25) { res.status(400).json({ error: "Bad pipeline list" }); return; }
      const names = [...new Set(req.body.leadPipelines.map((n: any) => String(n || "").trim().slice(0, 120)).filter(Boolean))] as string[];
      if (!names.length) { res.status(400).json({ error: "Keep at least one lead pipeline" }); return; }
      setters.push((cfg) => { cfg.lead_pipelines = names; });
    }
    if (req.body?.closedStages !== undefined) {
      if (!Array.isArray(req.body.closedStages) || req.body.closedStages.length > 40) { res.status(400).json({ error: "Bad stage list" }); return; }
      const seen = new Set<string>();
      const stages: Array<{ pipeline: string; stage: string }> = [];
      for (const s of req.body.closedStages) {
        const pipeline = String(s?.pipeline || "").trim().slice(0, 120);
        const stage = String(s?.stage || "").trim().slice(0, 120);
        const key = `${pipeline}::${stage}`.toLowerCase();
        if (!pipeline || !stage || seen.has(key)) continue;
        seen.add(key);
        stages.push({ pipeline, stage });
      }
      setters.push((cfg) => { cfg.closed_stages = stages; });
    }
    if (req.body?.setterCalendar !== undefined) {
      const v = req.body.setterCalendar;
      if (v === null || v === "") {
        setters.push((cfg) => { cfg.setter_calendar = null; });
      } else {
        const id = String(v?.id || "").trim(), name = String(v?.name || "").trim().slice(0, 100);
        if (!id || !name) { res.status(400).json({ error: "Bad setter calendar" }); return; }
        setters.push((cfg) => { cfg.setter_calendar = { id, name }; });
      }
    }
    if (req.body?.closers !== undefined) {
      if (!Array.isArray(req.body.closers) || req.body.closers.length > 15) { res.status(400).json({ error: "Bad closer list" }); return; }
      const cleaned: Array<{ id: string; name: string }> = [];
      const seen = new Set<string>();
      for (const c of req.body.closers) {
        const id = String(c?.id || "").trim(), name = String(c?.name || "").trim().slice(0, 100);
        if (!id || !name || seen.has(id)) continue;
        seen.add(id);
        cleaned.push({ id, name });
      }
      if (!cleaned.length) { res.status(400).json({ error: "Keep at least one closer calendar on the list" }); return; }
      // Only accept ids that are real calendars on this org's GHL location.
      const cfgNow = await getCfg(cid);
      const conn = connOf(cfgNow, cid);
      if (conn) {
        const b = await ghlGet(conn, `/calendars/?locationId=${conn.locationId}`).catch(() => null);
        const valid = new Set(((b?.calendars || []) as any[]).map((c) => String(c.id)));
        if (valid.size > 0) {
          const unknown = cleaned.filter((c) => !valid.has(c.id));
          if (unknown.length) { res.status(400).json({ error: "One of those calendars no longer exists in GoHighLevel" }); return; }
        }
      }
      setters.push((cfg) => { cfg.closers = cleaned; });
    }
    const saved = await mutateCfg(cid, (cfg) => {
      for (const s of setters) s(cfg);
      if (!cfg.connected_by) cfg.connected_by = caller.id;
    });
    if (!saved) { res.status(502).json({ error: "Could not save settings" }); return; }
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not save settings" }); }
});

// Post a report right now — lets the user test without waiting for the scheduled day.
router.post("/ghl-kpi/run-now", async (req: Request, res: Response) => {
  try {
    const caller = await requireOrgAdmin(req, res);
    if (!caller) return;
    const kind = String(req.body?.kind || "weekly");
    if (!["weekly", "payout"].includes(kind)) { res.status(400).json({ error: "Bad report kind" }); return; }
    const cfg = await getCfg(caller.company_id);
    if (!cfg.connected_by) cfg.connected_by = caller.id;
    const r = kind === "weekly" ? await runWeekly(caller.company_id, cfg) : await runPayout(caller.company_id, cfg);
    if (!r.ok) { res.status(400).json({ error: r.error || "Report failed" }); return; }
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not run the report" }); }
});

export default router;

export function buildContactCloserMap(allDeals: Deal[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const d of allDeals) {
    if (d.contactId && d.closer && !m.has(d.contactId)) m.set(d.contactId, d.closer);
  }
  return m;
}

// Net cash collected in [startMs, endMs) per closer, given:
//   • succeeded txs whose createdAt is in [startMs, endMs):
//       net = amount − amountRefunded  (GHL shows current state; captures in-period
//       partial refunds and refunds issued before the payout report runs)
//   • refunded txs (status="refunded") whose updatedAt is in [startMs, endMs)
//     AND createdAt < startMs:
//       net = −amount  (full refund issued this period on a prior payment)
//   • refunded txs where BOTH createdAt and updatedAt are in period → zero; skip
// ⚠ Known limitation: a succeeded tx from a prior period that received a
//   PARTIAL refund after that period's payout was already calculated cannot be
//   detected here — the tx stays "succeeded" and won't appear in the current
//   period.  Task #293 tracks this gap.
// Transactions whose contactId has no entry in contactCloserMap are excluded.
export function cashCommissionByCloser(
  txs: GhlTransaction[],
  contactCloserMap: Map<string, string>,
  startMs: number,
  endMs: number,
  rate: number = DEFAULT_RATE,
): CashCloserRow[] {
  const map = new Map<string, { collected: number; txCount: number }>();

  for (const tx of txs) {
    if (tx.status === "failed") continue;
    const closer = contactCloserMap.get(tx.contactId);
    if (!closer) continue; // unattributed — no closed deal for this contact

    const createdMs = Date.parse(tx.createdAt || "");
    const updatedMs = Date.parse(tx.updatedAt || "");
    let net = 0;

    if (tx.status === "succeeded") {
      // Only payments received in this period; use current API net amount.
      if (!Number.isFinite(createdMs) || createdMs < startMs || createdMs >= endMs) continue;
      net = tx.amount - (tx.amountRefunded || 0);
    } else if (tx.status === "refunded") {
      if (Number.isFinite(createdMs) && createdMs >= startMs && createdMs < endMs) {
        // Payment AND full refund both in this period → nets to zero; skip.
        continue;
      }
      // Full refund issued in this period for a prior payment.
      if (!Number.isFinite(updatedMs) || updatedMs < startMs || updatedMs >= endMs) continue;
      net = -(tx.amount);
    }

    if (net === 0) continue;
    const cur = map.get(closer) || { collected: 0, txCount: 0 };
    cur.collected += net;
    cur.txCount += net > 0 ? 1 : 0; // count payments, not refund lines
    map.set(closer, cur);
  }

  return [...map.entries()]
    .map(([name, v]) => ({
      name,
      collected: v.collected,
      commission: v.collected * rate,
      txCount: v.txCount,
    }))
    .sort((a, b) => b.collected - a.collected);
}
