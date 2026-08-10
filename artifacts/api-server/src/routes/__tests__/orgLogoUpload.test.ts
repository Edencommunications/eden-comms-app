// orgLogoUpload.test.ts — verifies the /branding/logo upload endpoint:
// staff-only authorization, image-type and 5 MB enforcement, and that a
// successful upload lands in the org-logos bucket and returns its public
// https URL (never a data: URL).
// Run with:  pnpm --filter @workspace/api-server run test
//
// Supabase (auth, profiles, storage) is mocked at the global-fetch level.

process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-key";
process.env.SESSION_SECRET ||= "test-session-secret";

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";

const SUPABASE_HOST = "jzdoojlwgpqlmworwcsr.supabase.co";
const ORG = "b0000000-0000-0000-0000-000000000001";

const tokens: Record<string, string> = {
  "tok-staff": "coach@x.co",
  "tok-client": "client@x.co",
};
const profiles: Record<string, any> = {
  // requireStaffJwt queries with role=neq.client — a client yields no rows
  "coach@x.co": { id: "s1", role: "coach", company_id: ORG },
};

let bucketCreates = 0;
let uploads: Array<{ path: string; contentType: string; bytes: number }> = [];

const realFetch = globalThis.fetch;
function mockSupabase() {
  globalThis.fetch = (async (input: any, init: any = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const u = new URL(url);
    if (u.host !== SUPABASE_HOST) return realFetch(input, init);
    const json = (body: any, status = 200) =>
      new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

    if (u.pathname === "/auth/v1/user") {
      const tok = String(init.headers?.Authorization || "").replace("Bearer ", "");
      const email = tokens[tok];
      return email ? json({ email }) : json({ error: "bad token" }, 401);
    }
    if (u.pathname === "/rest/v1/user_profiles") {
      const email = String(u.searchParams.get("email") || "").replace("eq.", "");
      const p = profiles[email];
      return json(p ? [p] : []);
    }
    if (u.pathname === "/storage/v1/bucket") {
      bucketCreates++;
      return json({ error: "Duplicate" }, 409); // already exists — fine
    }
    const m = u.pathname.match(/^\/storage\/v1\/object\/org-logos\/(.+)$/);
    if (m && String(init.method).toUpperCase() === "POST") {
      const body = init.body as Buffer;
      uploads.push({
        path: m[1] as string,
        contentType: String((init.headers as any)?.["Content-Type"] || ""),
        bytes: body?.length || 0,
      });
      return json({ Key: `org-logos/${m[1]}` });
    }
    return json({ error: `unmocked ${u.pathname}` }, 500);
  }) as typeof fetch;
}

let server: http.Server;
let base = "";

before(async () => {
  mockSupabase();
  const { default: orgLogoRouter } = await import("../orgLogo");
  const app = express();
  app.use(express.json({ limit: "25mb" }));
  app.use(orgLogoRouter);
  server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, () => r()));
  const addr = server.address() as any;
  base = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  globalThis.fetch = realFetch;
});

beforeEach(() => { uploads = []; });

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const post = (token: string | null, body: any) =>
  fetch(`${base}/branding/logo`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

test("rejects anonymous callers", async () => {
  const r = await post(null, { key: ORG, contentType: "image/png", dataBase64: PNG_B64 });
  assert.equal(r.status, 401);
  assert.equal(uploads.length, 0);
});

test("rejects clients (staff only)", async () => {
  const r = await post("tok-client", { key: ORG, contentType: "image/png", dataBase64: PNG_B64 });
  assert.equal(r.status, 401);
  assert.equal(uploads.length, 0);
});

test("rejects non-image content types", async () => {
  const r = await post("tok-staff", { key: ORG, contentType: "text/html", dataBase64: PNG_B64 });
  assert.equal(r.status, 400);
  assert.equal(uploads.length, 0);
});

test("rejects files over 5 MB", async () => {
  const big = Buffer.alloc(5 * 1024 * 1024 + 1, 7).toString("base64");
  const r = await post("tok-staff", { key: ORG, contentType: "image/png", dataBase64: big });
  assert.equal(r.status, 413);
  assert.equal(uploads.length, 0);
});

test("staff upload lands in org-logos and returns a public https URL", async () => {
  const r = await post("tok-staff", { key: ORG, contentType: "image/png", dataBase64: PNG_B64 });
  assert.equal(r.status, 200);
  const body: any = await r.json();
  assert.match(body.url, /^https:\/\/.+\/storage\/v1\/object\/public\/org-logos\/.+\.png$/);
  assert.ok(!body.url.startsWith("data:"));
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0]!.contentType, "image/png");
  assert.equal(uploads[0]!.bytes, Buffer.from(PNG_B64, "base64").length);
  // the object path starts with the sanitized org key
  assert.ok(uploads[0]!.path.startsWith(ORG));
});

test("sanitizes hostile keys in the storage path", async () => {
  const r = await post("tok-staff", { key: "../evil bucket", contentType: "image/png", dataBase64: PNG_B64 });
  assert.equal(r.status, 200);
  assert.ok(!uploads[0]!.path.includes("/"));
  assert.ok(!uploads[0]!.path.includes(".."));
});
