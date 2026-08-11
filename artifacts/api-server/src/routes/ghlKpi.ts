// ghlKpi.ts — Weekly GoHighLevel KPI report posted into a Team Hub community.
//
// Eden HQ connects its GHL location via a Private Integration Token that
// lives in the server-only GHL_PIT_TOKEN secret (never in the database).
// Every Monday morning the scheduler pulls the previous Mon–Sun week from
// GHL — new leads, setter calls (Complimentary Call), closing calls
// (Lauren + Martin), closed deals (Deposit Paid / Foundation / Launch /
// Scale) and their dollar values — computes 15% closer commissions
// (weekly + month-to-date), and posts a plain-English report into the
// admin-chosen community. On the 15th of each month it posts a commission
// payout report covering the previous calendar month.
//
// Same reliability pattern as metaAds.ts: config + markers in
// admin_settings (key 'ghl_kpi', Eden org only), CAS-claimed markers so
// two server instances can't double-post, marker rollback with a 3-try cap
// on failure, admin bell alerts instead of silent failures, raw payloads
// archived in admin_settings for history, and an evaluated /healthz entry.
import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import { notifyCommunityMembers } from "./communityPost";
import { requireStaff } from "./checkinForm";

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const EDEN_COMPANY_ID = "b0000000-0000-0000-0000-000000000001";
const GHL_BASE = "https://services.leadconnectorhq.com";
const LOCATION_ID = "kuKtKnNy2D1k5hVocBdJ";

// Pipelines that count as "leads" (createdAt within the week).
const LEAD_PIPELINE_NAMES = [
  "New Lead",
  "Application Pipeline",
  "Workshop Pipeline",
  "Clients",
  "University Mentees",
];
// Closed-deal stages: entering any of these within the week counts as a close.
const CLOSED_STAGES: Array<{ pipeline: string; stage: string }> = [
  { pipeline: "Application Pipeline", stage: "Deposit Paid" },
  { pipeline: "Clients", stage: "Foundation" },
  { pipeline: "Clients", stage: "Launch" },
  { pipeline: "Clients", stage: "Scale" },
];
const SETTER_CALENDAR = { id: "1z14MTqpliMfJXqIWwd5", name: "Complimentary Call" };
// Default closer calendars — used only until admins customize the list.
const DEFAULT_CLOSER_CALENDARS = [
  { id: "XRg1BpwuMU53M1moK62C", name: "Lauren Sedlar Calendar" },
  { id: "NeVnLNtJd5L98Mc2fhtl", name: "Martin Nwakamma Calendar" },
];
const COMMISSION_RATE = 0.15;

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
async function dbUpsertSetting(key: string, value: string): Promise<boolean> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`, {
    method: "POST",
    headers: { ...SH, Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({
      company_id: EDEN_COMPANY_ID,
      key,
      value,
      updated_at: new Date().toISOString(),
    }),
  });
  return r.ok;
}

// ── Config (admin_settings key 'ghl_kpi', Eden org only) ────────

type GhlCfg = {
  community_id?: string | null;
  community_name?: string | null;
  weekly?: boolean;          // weekly KPI report on/off
  payout?: boolean;          // monthly commission payout report on/off
  hour?: number;             // UTC hour reports post at (default 11 ≈ 6am CT)
  weekly_dow?: number;       // Central weekday for the weekly post (0=Sun … 6=Sat, default 1=Mon)
  payout_day?: number;       // Central day-of-month for the payout post (1–28, default 15)
  closers?: Array<{ id: string; name: string }>; // closer calendars (default Lauren + Martin)
  last_weekly?: string;      // YYYY-MM-DD marker
  last_payout?: string;      // YYYY-MM marker
  closer_names?: Record<string, string>; // GHL userId → display name cache
  connected_by?: string | null;
};

// Closer calendar list — customizable, falls back to the built-in default.
export function closersOf(cfg: GhlCfg): Array<{ id: string; name: string }> {
  const list = Array.isArray(cfg.closers)
    ? cfg.closers.filter((c) => c && typeof c.id === "string" && c.id.trim())
    : [];
  return list.length ? list : DEFAULT_CLOSER_CALENDARS;
}
// Human display name for a closer calendar ("Lauren Sedlar Calendar" → "Lauren Sedlar").
const closerDisplay = (name: string) =>
  String(name || "").replace(/\s*calendar\s*$/i, "").trim() || name;

async function getCfg(): Promise<GhlCfg> {
  const rows = await dbGet<any>(
    `admin_settings?company_id=eq.${EDEN_COMPANY_ID}&key=eq.ghl_kpi&select=value`,
  );
  try {
    const v = rows[0]?.value;
    return (typeof v === "string" ? JSON.parse(v) : v) || {};
  } catch { return {}; }
}
async function saveCfg(cfg: GhlCfg): Promise<boolean> {
  return dbUpsertSetting("ghl_kpi", JSON.stringify(cfg));
}
// Safe read-modify-write: re-fetches fresh bytes and applies `fn` under CAS,
// retrying on conflict. Every writer (settings saves, name-cache persistence,
// failure rollback) must go through this — dev and prod share the DB, so a
// plain whole-config save can clobber another instance's markers and cause
// duplicate posts.
async function mutateCfg(fn: (cfg: GhlCfg) => void, tries = 3): Promise<boolean> {
  for (let i = 0; i < tries; i++) {
    const rows = await dbGet<any>(
      `admin_settings?company_id=eq.${EDEN_COMPANY_ID}&key=eq.ghl_kpi&select=value`,
    );
    if (!rows[0]) {
      const cfg: GhlCfg = {};
      fn(cfg);
      if (await saveCfg(cfg)) return true;
      continue;
    }
    const raw = typeof rows[0].value === "string" ? rows[0].value : JSON.stringify(rows[0].value);
    let cfg: GhlCfg = {};
    try { cfg = JSON.parse(raw) || {}; } catch { /* start clean */ }
    fn(cfg);
    if (await casCfg(raw, cfg)) return true;
  }
  return false;
}
// Compare-and-swap: only writes if the stored bytes are unchanged, so two
// server instances (dev + prod share this DB) can never double-post.
async function casCfg(expectedRaw: string, cfg: GhlCfg): Promise<boolean> {
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${EDEN_COMPANY_ID}&key=eq.ghl_kpi&value=eq.${encodeURIComponent(expectedRaw)}`,
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

// ── GHL API (retry/backoff, pagination) ─────────────────────────

function ghlToken(): string { return process.env.GHL_PIT_TOKEN || ""; }

async function ghlGet(path: string): Promise<any> {
  const headers = {
    Authorization: `Bearer ${ghlToken()}`,
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
async function fetchPipelineOpps(pipelineId: string): Promise<any[]> {
  const out: any[] = [];
  let expectedTotal: number | null = null;
  for (let page = 1; page <= 50; page++) {
    const b = await ghlGet(
      `/opportunities/search?location_id=${LOCATION_ID}&pipeline_id=${pipelineId}&limit=100&page=${page}`,
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

async function fetchCalendarEvents(calendarId: string, startMs: number, endMs: number): Promise<any[]> {
  const b = await ghlGet(
    `/calendars/events?locationId=${LOCATION_ID}&calendarId=${calendarId}&startTime=${startMs}&endTime=${endMs}`,
  );
  return Array.isArray(b?.events) ? b.events : [];
}

// GHL userId → human name (cached in config; falls back to short id).
async function resolveCloserName(userId: string, cache: Record<string, string>): Promise<string> {
  if (!userId) return "Unassigned";
  if (cache[userId]) return cache[userId];
  try {
    const b = await ghlGet(`/users/${userId}`);
    const name = String(b?.name || `${b?.firstName || ""} ${b?.lastName || ""}`.trim() || "").trim();
    if (name) { cache[userId] = name; return name; }
  } catch { /* fall through */ }
  return `Closer …${userId.slice(-4)}`;
}

// ── Pure calculation helpers (exported for tests) ───────────────

export type Windows = {
  weekStart: string; weekEnd: string;       // previous Mon–Sun (Central dates)
  weekStartMs: number; weekEndMs: number;   // [start, end) — Central midnights as real instants
  mtdStart: string; mtdStartMs: number;     // 1st of current Central month → now
};

// The business runs on US Central time, so week/month boundaries must be
// Central midnights (a deal closed 11pm Sunday in Texas belongs to that
// week, even though it's already Monday in UTC).
const CENTRAL_TZ = "America/Chicago";

// Calendar date (y, m0, d) + weekday in the Central timezone.
export function centralDateParts(now: Date): { y: number; m0: number; d: number; dow: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: CENTRAL_TZ, year: "numeric", month: "numeric", day: "numeric", weekday: "short",
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(now)) parts[p.type] = p.value;
  const dow = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].indexOf(parts.weekday || "");
  return { y: Number(parts.year), m0: Number(parts.month) - 1, d: Number(parts.day), dow };
}

// The real UTC instant of midnight on a given Central calendar date.
// Two-pass offset lookup so DST transition days resolve correctly.
export function centralMidnightMs(y: number, m0: number, d: number): number {
  const offsetAt = (ms: number) => {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: CENTRAL_TZ, year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", minute: "numeric", second: "numeric", hour12: false,
    });
    const p: Record<string, string> = {};
    for (const part of fmt.formatToParts(new Date(ms))) p[part.type] = part.value;
    const wall = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day),
      Number(p.hour) % 24, Number(p.minute), Number(p.second));
    return wall - ms; // negative for Central (UTC-5/-6)
  };
  let guess = Date.UTC(y, m0, d, 6); // ≈ Central midnight in UTC
  guess = Date.UTC(y, m0, d) - offsetAt(guess);
  return Date.UTC(y, m0, d) - offsetAt(guess);
}

const isoOf = (y: number, m0: number, d: number) =>
  new Date(Date.UTC(y, m0, d)).toISOString().slice(0, 10);
const dayIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Given "now", the reporting week is the last FULL Central Mon–Sun before today.
export function computeWindows(now: Date): Windows {
  const c = centralDateParts(now);
  const daysSinceMonday = (c.dow + 6) % 7; // Monday → 0
  // Walk back on the Central calendar via a UTC-noon anchor (DST-safe).
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
    weekStartMs: centralMidnightMs(mon.y, mon.m0, mon.d),
    weekEndMs: centralMidnightMs(nextMon.y, nextMon.m0, nextMon.d),
    mtdStart: isoOf(c.y, c.m0, 1),
    mtdStartMs: centralMidnightMs(c.y, c.m0, 1),
  };
}

// Previous Central calendar month [start, end) for the payout report.
export function payoutWindow(now: Date): { label: string; startMs: number; endMs: number } {
  const c = centralDateParts(now);
  const prev = new Date(Date.UTC(c.y, c.m0 - 1, 1));
  const py = prev.getUTCFullYear(), pm0 = prev.getUTCMonth();
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return {
    label: `${months[pm0]} ${py}`,
    startMs: centralMidnightMs(py, pm0, 1),
    endMs: centralMidnightMs(c.y, c.m0, 1),
  };
}

export type Deal = { id: string; name: string; value: number; closer: string; whenMs: number };

// Deals whose closed-stage entry falls inside [startMs, endMs).
export function dealsInRange(deals: Deal[], startMs: number, endMs: number): Deal[] {
  return deals.filter((d) => d.whenMs >= startMs && d.whenMs < endMs);
}
export function commissionByCloser(deals: Deal[]): Array<{ name: string; sales: number; commission: number; deals: number }> {
  const map = new Map<string, { sales: number; deals: number }>();
  for (const d of deals) {
    const cur = map.get(d.closer) || { sales: 0, deals: 0 };
    cur.sales += d.value; cur.deals += 1;
    map.set(d.closer, cur);
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, sales: v.sales, commission: v.sales * COMMISSION_RATE, deals: v.deals }))
    .sort((a, b) => b.sales - a.sales);
}

const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return `${months[(m || 1) - 1]} ${d}, ${y}`;
};

export type WeeklyPayload = {
  week_start: string; week_end: string;
  leads: number;
  setter_calls_booked: number; setter_calls_showed: number;
  closing_calls_booked: number; closing_calls_showed: number;
  closer_label?: string;   // e.g. "Lauren + Martin" — from the configured closer calendars
  closed_deals: number; total_amount: number;
  commissions_by_closer: Array<{ name: string; sales: number; commission: number; deals: number }>;
  total_commissions: number;
  mtd: { start: string; closed_deals: number; total_amount: number; commissions_by_closer: Array<{ name: string; sales: number; commission: number; deals: number }>; total_commissions: number };
};

export function buildWeeklyMessage(p: WeeklyPayload): string {
  const lines = [
    "📈 WEEKLY KPI REPORT",
    `${fmtDate(p.week_start)} → ${fmtDate(p.week_end)}`,
    "━━━━━━━━━━━━━━━",
    "",
    "🧲 LEADS",
    `• New leads: ${p.leads}`,
    "",
    "📞 SETTER CALLS (Complimentary Call)",
    `• Booked: ${p.setter_calls_booked}`,
    `• Showed: ${p.setter_calls_showed}`,
    "",
    `🤝 CLOSING CALLS${p.closer_label ? ` (${p.closer_label})` : ""}`,
    `• Booked: ${p.closing_calls_booked}`,
    `• Showed: ${p.closing_calls_showed}`,
    "",
    "💰 CLOSED DEALS",
    `• Deals closed: ${p.closed_deals}`,
    `• Total value: ${usd(p.total_amount)}`,
  ];
  lines.push("", "💵 CLOSER COMMISSIONS (15%) — THIS WEEK");
  if (p.commissions_by_closer.length) {
    for (const c of p.commissions_by_closer) {
      lines.push(`• ${c.name}: ${usd(c.commission)} (${c.deals} deal${c.deals === 1 ? "" : "s"}, ${usd(c.sales)} in sales)`);
    }
    lines.push(`• Team total: ${usd(p.total_commissions)}`);
  } else {
    lines.push("• No closed deals this week.");
  }
  lines.push("", `📆 MONTH TO DATE (since ${fmtDate(p.mtd.start)})`);
  lines.push(`• Deals closed: ${p.mtd.closed_deals} · Total value: ${usd(p.mtd.total_amount)}`);
  if (p.mtd.commissions_by_closer.length) {
    for (const c of p.mtd.commissions_by_closer) lines.push(`• ${c.name}: ${usd(c.commission)} commission so far`);
    lines.push(`• Team total so far: ${usd(p.mtd.total_commissions)}`);
  }
  return lines.join("\n");
}

export function buildPayoutMessage(label: string, deals: Deal[], payoutDay = 15): string {
  const byCloser = commissionByCloser(deals);
  const total = byCloser.reduce((s, c) => s + c.commission, 0);
  const sales = byCloser.reduce((s, c) => s + c.sales, 0);
  const suffix = payoutDay === 1 ? "st" : payoutDay === 2 ? "nd" : payoutDay === 3 ? "rd" : payoutDay === 21 ? "st" : payoutDay === 22 ? "nd" : payoutDay === 23 ? "rd" : "th";
  const lines = [
    "💵 COMMISSION PAYOUT REPORT",
    `For ${label} closes — payable on the ${payoutDay}${suffix}`,
    "━━━━━━━━━━━━━━━",
    "",
  ];
  if (!byCloser.length) {
    lines.push(`No deals were closed in ${label}, so there are no commissions to pay out.`);
    return lines.join("\n");
  }
  for (const c of byCloser) {
    lines.push(`• ${c.name}: ${usd(c.commission)} (15% of ${usd(c.sales)} · ${c.deals} deal${c.deals === 1 ? "" : "s"})`);
  }
  lines.push("", `Team total: ${usd(total)} on ${usd(sales)} in ${label} sales.`);
  return lines.join("\n");
}

// ── Data pull ───────────────────────────────────────────────────

// Pipeline/stage ids are resolved by NAME at run time so renames/rebuilds
// in GHL can't silently break the report against stale hardcoded ids.
async function resolvePipelines(): Promise<{
  leadPipelineIds: string[];
  closedStages: Array<{ pipelineId: string; stageId: string }>;
  missing: string[];
}> {
  const b = await ghlGet(`/opportunities/pipelines?locationId=${LOCATION_ID}`);
  const pipelines: any[] = Array.isArray(b?.pipelines) ? b.pipelines : [];
  const byName = new Map(pipelines.map((p) => [String(p.name).trim().toLowerCase(), p]));
  const missing: string[] = [];
  const leadPipelineIds: string[] = [];
  for (const name of LEAD_PIPELINE_NAMES) {
    const p = byName.get(name.toLowerCase());
    if (p) leadPipelineIds.push(p.id); else missing.push(`pipeline "${name}"`);
  }
  const closedStages: Array<{ pipelineId: string; stageId: string }> = [];
  for (const cs of CLOSED_STAGES) {
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
async function pullWeekData(cfg: GhlCfg, w: Windows) {
  const { leadPipelineIds, closedStages, missing } = await resolvePipelines();
  if (missing.length) throw new Error(`GHL setup changed — could not find: ${missing.join(", ")}.`);

  // Opportunities for every relevant pipeline, fetched once each.
  const pipelineIds = [...new Set([...leadPipelineIds, ...closedStages.map((c) => c.pipelineId)])];
  const oppsByPipeline = new Map<string, any[]>();
  for (const pid of pipelineIds) oppsByPipeline.set(pid, await fetchPipelineOpps(pid));

  // 1. Leads — created inside the week, across the lead pipelines.
  let leads = 0;
  for (const pid of leadPipelineIds) {
    for (const o of oppsByPipeline.get(pid) || []) {
      const t = Date.parse(o.createdAt || "");
      if (Number.isFinite(t) && t >= w.weekStartMs && t < w.weekEndMs) leads++;
    }
  }

  // 2–3. Appointments.
  const setterEvents = await fetchCalendarEvents(SETTER_CALENDAR.id, w.weekStartMs, w.weekEndMs);
  let closingBooked = 0, closingShowed = 0;
  for (const cal of closersOf(cfg)) {
    const evs = await fetchCalendarEvents(cal.id, w.weekStartMs, w.weekEndMs);
    closingBooked += evs.filter(isBooked).length;
    closingShowed += evs.filter(isShowed).length;
  }

  // 4–6. Closed deals (all-time list; callers slice by window). Stage-entry
  // time = lastStageChangeAt (falls back to updatedAt/createdAt when GHL
  // omits it).
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
        closer: await resolveCloserName(String(o.assignedTo || ""), closerCache),
        whenMs: t,
      });
    }
  }
  cfg.closer_names = closerCache;

  return {
    leads,
    setter_calls_booked: setterEvents.filter(isBooked).length,
    setter_calls_showed: setterEvents.filter(isShowed).length,
    closing_calls_booked: closingBooked,
    closing_calls_showed: closingShowed,
    allDeals,
  };
}

// ── Posting ─────────────────────────────────────────────────────

async function notifyAdmins(body: string): Promise<void> {
  const admins = await dbGet<any>(`user_profiles?company_id=eq.${EDEN_COMPANY_ID}&role=eq.super_admin&is_active=not.is.false&select=id`);
  for (const a of admins) {
    await dbInsert("notifications", { recipient_id: a.id, type: "ghl_kpi", body, is_read: false });
  }
}

async function postToCommunity(cfg: GhlCfg, text: string): Promise<{ ok: boolean; error?: string }> {
  if (!cfg.community_id) return { ok: false, error: "No community chosen for KPI reports yet." };
  const comm = await dbGet<any>(`communities?id=eq.${encodeURIComponent(cfg.community_id)}&company_id=eq.${EDEN_COMPANY_ID}&is_active=eq.true&select=id,name`);
  if (!comm[0]) {
    await notifyAdmins("⚠️ Weekly KPI reports are paused — the community they post into no longer exists. Pick a new one in the admin panel (Overview → GHL KPI Reports).");
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
    await notifyAdmins("⚠️ The weekly KPI report was generated but could not be posted to the chosen community. Check Overview → GHL KPI Reports.");
    return { ok: false, error: "Could not post into the community." };
  }
  await notifyCommunityMembers(cfg.community_id, comm[0]?.name || "KPIs", cfg.connected_by || null);
  return { ok: true };
}

async function runWeekly(cfg: GhlCfg): Promise<{ ok: boolean; error?: string }> {
  if (!ghlToken()) return { ok: false, error: "The GHL connection is missing on the server (GHL_PIT_TOKEN)." };
  const now = new Date();
  const w = computeWindows(now);
  let data;
  try {
    data = await pullWeekData(cfg, w);
  } catch (e: any) {
    const msg = String(e?.message || e).slice(0, 300);
    await notifyAdmins(`⚠️ The weekly KPI report could not pull data from GoHighLevel: ${msg}`);
    return { ok: false, error: msg };
  }
  const weekDeals = dealsInRange(data.allDeals, w.weekStartMs, w.weekEndMs);
  const mtdDeals = dealsInRange(data.allDeals, w.mtdStartMs, now.getTime());
  const weekComm = commissionByCloser(weekDeals);
  const mtdComm = commissionByCloser(mtdDeals);
  const payload: WeeklyPayload = {
    week_start: w.weekStart, week_end: w.weekEnd,
    leads: data.leads,
    setter_calls_booked: data.setter_calls_booked,
    setter_calls_showed: data.setter_calls_showed,
    closing_calls_booked: data.closing_calls_booked,
    closing_calls_showed: data.closing_calls_showed,
    closer_label: closersOf(cfg).map((c) => closerDisplay(c.name).split(" ")[0]).join(" + "),
    closed_deals: weekDeals.length,
    total_amount: weekDeals.reduce((s, d) => s + d.value, 0),
    commissions_by_closer: weekComm,
    total_commissions: weekComm.reduce((s, c) => s + c.commission, 0),
    mtd: {
      start: w.mtdStart,
      closed_deals: mtdDeals.length,
      total_amount: mtdDeals.reduce((s, d) => s + d.value, 0),
      commissions_by_closer: mtdComm,
      total_commissions: mtdComm.reduce((s, c) => s + c.commission, 0),
    },
  };
  const r = await postToCommunity(cfg, buildWeeklyMessage(payload));
  if (r.ok) {
    // Persist the raw payload for history (best-effort; the post already went).
    await dbUpsertSetting(`ghl_kpi_hist:${w.weekStart}`, JSON.stringify(payload));
    await persistCloserNames(cfg.closer_names || {});
  }
  return r;
}

async function runPayout(cfg: GhlCfg): Promise<{ ok: boolean; error?: string }> {
  if (!ghlToken()) return { ok: false, error: "The GHL connection is missing on the server (GHL_PIT_TOKEN)." };
  const now = new Date();
  const pw = payoutWindow(now);
  let data;
  try {
    data = await pullWeekData(cfg, computeWindows(now)); // reuse: allDeals is all-time
  } catch (e: any) {
    const msg = String(e?.message || e).slice(0, 300);
    await notifyAdmins(`⚠️ The monthly commission payout report could not pull data from GoHighLevel: ${msg}`);
    return { ok: false, error: msg };
  }
  const deals = dealsInRange(data.allDeals, pw.startMs, pw.endMs);
  const payoutDay = Number.isInteger(cfg.payout_day) && cfg.payout_day! >= 1 && cfg.payout_day! <= 28 ? cfg.payout_day! : 15;
  const r = await postToCommunity(cfg, buildPayoutMessage(pw.label, deals, payoutDay));
  if (r.ok) {
    await dbUpsertSetting(`ghl_kpi_payout:${dayIso(pw.startMs).slice(0, 7)}`, JSON.stringify({
      month: pw.label,
      commissions_by_closer: commissionByCloser(deals),
      deals: deals.map((d) => ({ name: d.name, value: d.value, closer: d.closer, when: dayIso(d.whenMs) })),
    }));
    await persistCloserNames(cfg.closer_names || {});
  }
  return r;
}

// Merge newly-resolved closer names into a FRESH copy of the config — the
// long GHL pull means our in-memory cfg may be stale, and writing it back
// whole would clobber markers or settings an admin changed mid-run.
async function persistCloserNames(names: Record<string, string>): Promise<void> {
  if (!Object.keys(names).length) return;
  await mutateCfg((cfg) => {
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

async function processDue() {
  try {
    const rows = await dbGet<any>(`admin_settings?company_id=eq.${EDEN_COMPANY_ID}&key=eq.ghl_kpi&select=value`);
    health.lastPassAt = Date.now();
    if (!rows[0]) { health.configured = false; health.lastPassOk = true; return; }
    const rawStored = typeof rows[0].value === "string" ? rows[0].value : JSON.stringify(rows[0].value);
    let cfg: GhlCfg = {};
    try { cfg = JSON.parse(rawStored) || {}; } catch { /* keep empty */ }
    health.configured = !!(cfg.community_id && (cfg.weekly || cfg.payout) && ghlToken());
    health.lastPassOk = true;
    if (!health.configured) return;

    const now = new Date();
    const hour = Number.isFinite(Number(cfg.hour)) ? Number(cfg.hour) : 11;
    if (now.getUTCHours() < hour) return;

    // Post day and payout day are judged on the CENTRAL calendar — the team
    // is in US Central time, and a UTC Monday starts Sunday evening for them.
    // Markers are Central-based too: the weekly marker is the REPORTED WEEK's
    // start date (not "today"), so crossing UTC midnight during one Central
    // day — or changing the post day mid-week — can never repost a week that
    // already went out. The payout marker is the Central month.
    const central = centralDateParts(now);
    const centralToday = isoOf(central.y, central.m0, central.d);
    const centralMonth = centralToday.slice(0, 7);
    const weekKey = computeWindows(now).weekStart;
    const weeklyDow = Number.isInteger(cfg.weekly_dow) && cfg.weekly_dow! >= 0 && cfg.weekly_dow! <= 6 ? cfg.weekly_dow! : 1;
    const payoutDay = Number.isInteger(cfg.payout_day) && cfg.payout_day! >= 1 && cfg.payout_day! <= 28 ? cfg.payout_day! : 15;
    const due: Array<"weekly" | "payout"> = [];
    if (cfg.weekly && central.dow === weeklyDow && cfg.last_weekly !== weekKey) due.push("weekly");
    if (cfg.payout && central.d === payoutDay && cfg.last_payout !== centralMonth) due.push("payout");
    if (!due.length) return;

    for (const kind of due) {
      // Claim EACH report separately with its own CAS on fresh bytes — a
      // shared claim would let one report's rollback resurrect (or erase)
      // the other's marker when both land on the same day (Monday the 15th).
      const freshRows = await dbGet<any>(`admin_settings?company_id=eq.${EDEN_COMPANY_ID}&key=eq.ghl_kpi&select=value`);
      if (!freshRows[0]) return;
      const freshRaw = typeof freshRows[0].value === "string" ? freshRows[0].value : JSON.stringify(freshRows[0].value);
      let freshCfg: GhlCfg = {};
      try { freshCfg = JSON.parse(freshRaw) || {}; } catch { continue; }
      // Re-check the marker on fresh bytes (another instance may have run it).
      if (kind === "weekly") {
        if (!freshCfg.weekly || freshCfg.last_weekly === weekKey) continue;
        freshCfg.last_weekly = weekKey;
      } else {
        if (!freshCfg.payout || freshCfg.last_payout === centralMonth) continue;
        freshCfg.last_payout = centralMonth;
      }
      if (!(await casCfg(freshRaw, freshCfg))) continue; // lost the claim — skip

      const r = kind === "weekly" ? await runWeekly(freshCfg) : await runPayout(freshCfg);
      logger.info({ kind, ok: r.ok, error: r.error }, "[GhlKpi] scheduled report");
      if (!r.ok) {
        health.lastPassOk = false;
        health.lastError = r.error || "report failed";
        // Roll only THIS report's marker back (up to 3 tries per day) so the
        // next 15-min pass retries; admins were already alerted by the run.
        await mutateCfg((rollback) => {
          const failKey = `fails_${kind}_${centralToday}`;
          const attempts = Number((rollback as any)[failKey] || 0) + 1;
          (rollback as any)[failKey] = attempts;
          if (attempts < 3) {
            if (kind === "weekly") delete rollback.last_weekly;
            if (kind === "payout") delete rollback.last_payout;
          }
          for (const k of Object.keys(rollback)) {
            if (k.startsWith("fails_") && !k.endsWith(centralToday)) delete (rollback as any)[k];
          }
        });
      }
    }
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

// ── Routes (Eden super admins only) ─────────────────────────────

const router: IRouter = Router();

async function requireEdenAdmin(req: Request, res: Response) {
  const caller = await requireStaff(req);
  if (!caller) { res.status(401).json({ error: "Not authorized" }); return null; }
  if (caller.role !== "super_admin" || caller.company_id !== EDEN_COMPANY_ID) {
    res.status(403).json({ error: "Only Eden admins can manage KPI reports" });
    return null;
  }
  return caller;
}

router.get("/ghl-kpi/status", async (req: Request, res: Response) => {
  try {
    const caller = await requireEdenAdmin(req, res);
    if (!caller) return;
    const cfg = await getCfg();
    res.json({
      ok: true,
      connected: !!ghlToken(),
      community_id: cfg.community_id || null,
      community_name: cfg.community_name || null,
      weekly: !!cfg.weekly,
      payout: !!cfg.payout,
      hour: Number.isFinite(Number(cfg.hour)) ? Number(cfg.hour) : 11,
      weekly_dow: Number.isInteger(cfg.weekly_dow) && cfg.weekly_dow! >= 0 && cfg.weekly_dow! <= 6 ? cfg.weekly_dow : 1,
      payout_day: Number.isInteger(cfg.payout_day) && cfg.payout_day! >= 1 && cfg.payout_day! <= 28 ? cfg.payout_day : 15,
      closers: closersOf(cfg),
    });
  } catch { res.status(500).json({ error: "Status check failed" }); }
});

// Strict integer parsing — Number("") is 0, which would silently turn a
// malformed empty input into "Sunday" or "midnight".
const intParam = (v: any): number | null => {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string" && /^-?\d+$/.test(v.trim())) return Number(v.trim());
  return null;
};

router.post("/ghl-kpi/settings", async (req: Request, res: Response) => {
  try {
    const caller = await requireEdenAdmin(req, res);
    if (!caller) return;
    // Validate everything up front, then apply as a field-merge under CAS so
    // an admin save can never clobber a scheduler's just-claimed marker.
    const setters: Array<(cfg: GhlCfg) => void> = [];
    const communityId = String(req.body?.communityId || "").trim();
    if (communityId) {
      const rows = await dbGet<any>(`communities?id=eq.${encodeURIComponent(communityId)}&company_id=eq.${EDEN_COMPANY_ID}&is_active=eq.true&select=id,name`);
      if (!rows[0]) { res.status(400).json({ error: "That community wasn't found" }); return; }
      setters.push((cfg) => { cfg.community_id = rows[0].id; cfg.community_name = rows[0].name; });
    }
    if (req.body?.weekly !== undefined) { const v = !!req.body.weekly; setters.push((cfg) => { cfg.weekly = v; }); }
    if (req.body?.payout !== undefined) { const v = !!req.body.payout; setters.push((cfg) => { cfg.payout = v; }); }
    if (req.body?.hour !== undefined) {
      const h = intParam(req.body.hour);
      if (h === null || h < 0 || h > 23) { res.status(400).json({ error: "Post hour must be 0–23" }); return; }
      setters.push((cfg) => { cfg.hour = h; });
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
      cfg_closers: {
        // Only accept ids that are real calendars on this GHL location.
        const b = await ghlGet(`/calendars/?locationId=${LOCATION_ID}`).catch(() => null);
        const valid = new Set(((b?.calendars || []) as any[]).map((c) => String(c.id)));
        if (valid.size === 0) break cfg_closers; // GHL unreachable — don't block the save
        const unknown = cleaned.filter((c) => !valid.has(c.id));
        if (unknown.length) { res.status(400).json({ error: "One of those calendars no longer exists in GoHighLevel" }); return; }
      }
      setters.push((cfg) => { cfg.closers = cleaned; });
    }
    const saved = await mutateCfg((cfg) => {
      for (const s of setters) s(cfg);
      if (!cfg.connected_by) cfg.connected_by = caller.id;
    });
    if (!saved) { res.status(502).json({ error: "Could not save settings" }); return; }
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not save settings" }); }
});

// List the location's active GHL calendars so admins can add/remove closer
// calendars by name instead of typing IDs.
router.get("/ghl-kpi/calendars", async (req: Request, res: Response) => {
  try {
    const caller = await requireEdenAdmin(req, res);
    if (!caller) return;
    const b = await ghlGet(`/calendars/?locationId=${LOCATION_ID}`);
    const cals: any[] = Array.isArray(b?.calendars) ? b.calendars : [];
    res.json({
      ok: true,
      calendars: cals
        .filter((c) => c?.isActive !== false)
        .map((c) => ({ id: String(c.id), name: String(c.name || c.id) }))
        .sort((a, b2) => a.name.localeCompare(b2.name)),
    });
  } catch { res.status(502).json({ error: "Could not load calendars from GoHighLevel" }); }
});

// Post a report right now — lets the user test without waiting for the scheduled day.
router.post("/ghl-kpi/run-now", async (req: Request, res: Response) => {
  try {
    const caller = await requireEdenAdmin(req, res);
    if (!caller) return;
    const kind = String(req.body?.kind || "weekly");
    if (!["weekly", "payout"].includes(kind)) { res.status(400).json({ error: "Bad report kind" }); return; }
    const cfg = await getCfg();
    if (!cfg.connected_by) cfg.connected_by = caller.id;
    const r = kind === "weekly" ? await runWeekly(cfg) : await runPayout(cfg);
    if (!r.ok) { res.status(400).json({ error: r.error || "Report failed" }); return; }
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "Could not run the report" }); }
});

export default router;
