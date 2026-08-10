import { Router, type IRouter } from "express";
import { unzipSync, strFromU8 } from "fflate";
import fs from "node:fs";
import path from "node:path";
import { logger } from "../lib/logger";

// ── Auto-import recipe details from the Eden Google Sheet ──────────────
// The FoodList tab links each recipe (column AT = name, AU = "Recipe/Method")
// to a per-recipe Google Doc. Those hyperlinks are NOT exposed via the gviz
// feed the app uses, so we pull the sheet's xlsx export (where hyperlinks are
// preserved), extract the doc links, fetch each doc's plain-text export, and
// parse out Ingredients / Instructions. Results are cached in memory, on
// disk, and in the database (admin_settings — no DDL available) so clients
// get instant responses that also survive redeploys (published filesystem is
// ephemeral, so the disk cache alone is not enough).

const SHEET_ID = "1lckx8AWxzxxddhWESgj7R-FVHoE6g2JBC9NG1J72QTA";
const SHEET_NAME = "FoodList";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // refresh at most every 6 hours
const DOC_FETCH_CONCURRENCY = 5;
const CACHE_FILE = path.join(process.cwd(), ".cache", "recipe-details.json");

type RecipeDetail = { ingredients: string[]; method: string[] };
type CachePayload = {
  updatedAt: string;
  recipes: Record<string, RecipeDetail>;
};

let memoryCache: CachePayload | null = null;
let refreshing: Promise<CachePayload | null> | null = null;

// ── DB persistence (admin_settings key-value — schema is frozen, no DDL) ──
// The recipe sheet is Eden-wide content, so the cache lives under the Eden
// org's row: key 'recipe_details_cache' → full CachePayload JSON.

const SUPABASE_URL = "https://jzdoojlwgpqlmworwcsr.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const EDEN_ORG_ID = "b0000000-0000-0000-0000-000000000001";
const DB_CACHE_KEY = "recipe_details_cache";
const SH = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function loadDbCache(): Promise<CachePayload | null> {
  if (!SERVICE_KEY) return null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/admin_settings?company_id=eq.${EDEN_ORG_ID}&key=eq.${DB_CACHE_KEY}&select=value`,
      { headers: SH },
    );
    if (!r.ok) return null;
    const rows = (await r.json()) as Array<{ value: unknown }>;
    if (!rows[0]) return null;
    const parsed =
      typeof rows[0].value === "string"
        ? JSON.parse(rows[0].value)
        : rows[0].value;
    if (parsed && parsed.recipes && parsed.updatedAt) return parsed;
  } catch (err) {
    logger.warn({ err }, "recipe-details: failed to load DB cache");
  }
  return null;
}

async function saveDbCache(payload: CachePayload): Promise<void> {
  if (!SERVICE_KEY) return;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/admin_settings?on_conflict=company_id,key`,
      {
        method: "POST",
        headers: { ...SH, Prefer: "resolution=merge-duplicates" },
        body: JSON.stringify({
          company_id: EDEN_ORG_ID,
          key: DB_CACHE_KEY,
          value: JSON.stringify(payload),
        }),
      },
    );
    if (!r.ok)
      logger.warn(
        { status: r.status },
        "recipe-details: failed to save DB cache",
      );
  } catch (err) {
    logger.warn({ err }, "recipe-details: failed to save DB cache");
  }
}

// ── xlsx helpers (xlsx files are zip archives of XML) ──────────────────

function getAttr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`));
  return m ? m[1] : null;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&amp;/g, "&");
}

/** Extract { recipeName -> docUrl } from the sheet's xlsx export. */
async function fetchDocLinks(): Promise<Record<string, string>> {
  const res = await fetch(
    `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=xlsx`,
  );
  if (!res.ok) throw new Error(`sheet xlsx export failed: ${res.status}`);
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const read = (p: string) => (files[p] ? strFromU8(files[p]) : "");

  // Locate the FoodList worksheet via workbook.xml + its rels
  const workbook = read("xl/workbook.xml");
  const sheetTag = (workbook.match(/<sheet [^>]*>/g) || []).find(
    (t) => decodeXml(getAttr(t, "name") || "") === SHEET_NAME,
  );
  if (!sheetTag) throw new Error(`sheet tab "${SHEET_NAME}" not found`);
  const sheetRid = getAttr(sheetTag, "r:id");
  const wbRels = read("xl/_rels/workbook.xml.rels");
  const relTag = (wbRels.match(/<Relationship [^>]*>/g) || []).find(
    (t) => getAttr(t, "Id") === sheetRid,
  );
  const target = relTag && getAttr(relTag, "Target");
  if (!target) throw new Error("worksheet relationship not found");
  const sheetPath = `xl/${target.replace(/^\//, "")}`;
  const sheetXml = read(sheetPath);

  // Shared strings (cell values with t="s" index into this table)
  const sharedStrings = (
    read("xl/sharedStrings.xml").match(/<si>[\s\S]*?<\/si>/g) || []
  ).map((si) =>
    decodeXml(
      (si.match(/<t[^>]*>([\s\S]*?)<\/t>/g) || [])
        .map((t) => t.replace(/<t[^>]*>|<\/t>/g, ""))
        .join(""),
    ),
  );

  // Cell values keyed by ref (e.g. "AT12")
  const cells: Record<string, string> = {};
  // NOTE: lazy [^>]*? is required — a greedy quantifier makes the alternation
  // prefer the spanning branch and merge self-closing cells into one match
  for (const cell of sheetXml.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []) {
    const ref = getAttr(cell, "r");
    if (!ref) continue;
    const vMatch = cell.match(/<v[^>]*>([\s\S]*?)<\/v>/);
    let value = vMatch ? decodeXml(vMatch[1]) : "";
    if (getAttr(cell, "t") === "s" && vMatch)
      value = sharedStrings[Number(vMatch[1])] ?? "";
    if (getAttr(cell, "t") === "inlineStr") {
      const t = cell.match(/<t[^>]*>([\s\S]*?)<\/t>/);
      value = t ? decodeXml(t[1]) : "";
    }
    cells[ref] = value;
  }

  // Hyperlink rels for this worksheet
  const relsPath = sheetPath.replace(
    /worksheets\/(sheet\d+\.xml)$/,
    "worksheets/_rels/$1.rels",
  );
  const linkTargets: Record<string, string> = {};
  for (const rel of read(relsPath).match(/<Relationship [^>]*>/g) || []) {
    const id = getAttr(rel, "Id");
    const tgt = getAttr(rel, "Target");
    if (id && tgt) linkTargets[id] = decodeXml(tgt);
  }

  // Map hyperlinks in the Recipe/Method column (AU) to the recipe name (AT)
  const links: Record<string, string> = {};
  for (const h of sheetXml.match(/<hyperlink [^>]*\/?>/g) || []) {
    const ref = getAttr(h, "ref");
    const rid = getAttr(h, "r:id");
    if (!ref || !rid) continue;
    const m = ref.match(/^AU(\d+)$/);
    if (!m) continue;
    const url = linkTargets[rid];
    if (!url || !/docs\.google\.com\/document\/d\//.test(url)) continue;
    const name = (cells[`AT${m[1]}`] || "").trim();
    if (name) links[name] = url;
  }
  return links;
}

// ── Google Doc parsing ──────────────────────────────────────────────────

/** Parse a recipe doc's plain text into ingredients + method steps. */
export function parseRecipeDoc(text: string): RecipeDetail | null {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim());
  const ingredients: string[] = [];
  const method: string[] = [];
  let section: "none" | "ingredients" | "method" | "done" = "none";

  const isStop = (l: string) =>
    /^(estimated\s+macros|nutrient\s+benefits|macros\b|notes?:?$|enjoy\b)/i.test(
      l,
    );

  for (const raw of lines) {
    const line = raw.replace(/^[•*\-–▪◦]+\s*/, "").trim();
    if (!line) continue;
    if (/^ingredients\b/i.test(line)) {
      section = "ingredients";
      const rest = line.replace(/^ingredients:?\s*/i, "");
      if (rest) ingredients.push(rest);
      continue;
    }
    if (/^(instructions|method|directions|steps)\b/i.test(line)) {
      section = "method";
      continue;
    }
    if (section === "method" && isStop(line)) {
      section = "done";
      continue;
    }
    if (section === "ingredients") {
      // Sub-headers inside ingredients (e.g. "For the crust:") are kept as-is
      ingredients.push(line);
    } else if (section === "method") {
      method.push(line.replace(/^\d+[.)]\s*/, ""));
    }
  }

  if (!ingredients.length && !method.length) return null;
  return { ingredients, method };
}

async function fetchDocText(url: string): Promise<string | null> {
  const m = url.match(/document\/d\/([\w-]+)/);
  if (!m) return null;
  const res = await fetch(
    `https://docs.google.com/document/d/${m[1]}/export?format=txt`,
  );
  if (!res.ok) return null;
  return res.text();
}

// ── Cache orchestration ─────────────────────────────────────────────────

function loadDiskCache(): CachePayload | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    if (parsed && parsed.recipes && parsed.updatedAt) return parsed;
  } catch {
    /* no disk cache yet */
  }
  return null;
}

function saveDiskCache(payload: CachePayload) {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(payload));
  } catch (err) {
    logger.warn({ err }, "recipe-details: failed to write disk cache");
  }
}

async function buildCache(): Promise<CachePayload | null> {
  const links = await fetchDocLinks();
  const names = Object.keys(links);
  const recipes: Record<string, RecipeDetail> = {};
  // Fetch docs with limited concurrency
  let i = 0;
  await Promise.all(
    Array.from({ length: DOC_FETCH_CONCURRENCY }, async () => {
      while (i < names.length) {
        const name = names[i++];
        try {
          const text = await fetchDocText(links[name]);
          const parsed = text && parseRecipeDoc(text);
          if (parsed) recipes[name] = parsed;
        } catch (err) {
          logger.warn({ err, name }, "recipe-details: doc fetch failed");
        }
      }
    }),
  );
  if (!Object.keys(recipes).length) {
    // Never overwrite a good cache with an empty result
    logger.warn("recipe-details: refresh produced no recipes; keeping cache");
    return null;
  }
  const payload: CachePayload = {
    updatedAt: new Date().toISOString(),
    recipes,
  };
  memoryCache = payload;
  saveDiskCache(payload);
  await saveDbCache(payload);
  logger.info(
    { count: Object.keys(recipes).length },
    "recipe-details: cache refreshed",
  );
  return payload;
}

function refresh(): Promise<CachePayload | null> {
  if (!refreshing) {
    refreshing = buildCache()
      .catch((err) => {
        logger.warn({ err }, "recipe-details: refresh failed");
        return null;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

function isStale(cache: CachePayload | null): boolean {
  return !cache || Date.now() - Date.parse(cache.updatedAt) > CACHE_TTL_MS;
}

// Warm the memory cache on startup so the very first request after a
// redeploy is served instantly from the DB; if the copy is stale, refresh
// from the sheet in the background.
void (async () => {
  try {
    if (!memoryCache) memoryCache = loadDiskCache();
    if (!memoryCache) memoryCache = await loadDbCache();
    if (isStale(memoryCache)) void refresh();
  } catch (err) {
    logger.warn({ err }, "recipe-details: startup warm-up failed");
  }
})();

const router: IRouter = Router();

// GET /api/recipe-details          → cached details (stale-while-revalidate)
// GET /api/recipe-details?refresh=1 → force a synchronous refresh
router.get("/recipe-details", async (req, res) => {
  if (!memoryCache) memoryCache = loadDiskCache();
  if (!memoryCache) memoryCache = await loadDbCache(); // survives redeploys
  const force = req.query.refresh === "1";

  if (force || !memoryCache) {
    const fresh = await refresh();
    if (fresh) return res.json(fresh);
    if (memoryCache) return res.json(memoryCache); // fall back to stale copy
    return res
      .status(503)
      .json({ error: "recipe details unavailable; refresh failed" });
  }

  if (isStale(memoryCache)) void refresh(); // revalidate in the background
  return res.json(memoryCache);
});

export default router;
