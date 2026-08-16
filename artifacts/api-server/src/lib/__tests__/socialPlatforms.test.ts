// Tests for the TikTok/YouTube helper math and OAuth state signing.
import { test } from "node:test";
import assert from "node:assert/strict";
import { signState, verifyState, planTtChunks, ttPickPrivacy, ytShortTitle } from "../socialPlatforms";

test("oauth state round-trips for the right platform", () => {
  const s = signState("tiktok");
  assert.equal(verifyState(s, "tiktok"), true);
  assert.equal(verifyState(s, "youtube"), false, "state is platform-bound");
});

test("oauth state expires after 10 minutes and rejects tampering", () => {
  const now = Date.now();
  const s = signState("youtube", now);
  assert.equal(verifyState(s, "youtube", now + 9 * 60 * 1000), true);
  assert.equal(verifyState(s, "youtube", now + 11 * 60 * 1000), false, "expired");
  assert.equal(verifyState(s + "x", "youtube", now), false, "tampered mac");
  assert.equal(verifyState("", "youtube", now), false);
  assert.equal(verifyState("garbage.nomac", "youtube", now), false);
});

test("small/medium TikTok videos upload as a single chunk", () => {
  for (const size of [1, 5 * 1024 * 1024, 64 * 1024 * 1024]) {
    const p = planTtChunks(size);
    assert.equal(p.count, 1);
    assert.deepEqual(p.ranges, [{ start: 0, end: size - 1 }]);
  }
});

test("big TikTok videos chunk correctly with the last chunk absorbing the remainder", () => {
  const CHUNK = 32 * 1024 * 1024;
  const MAX_CHUNK = 64 * 1024 * 1024;
  for (const size of [65 * 1024 * 1024, 149 * 1024 * 1024, 3 * CHUNK + 7 * 1024 * 1024, 512 * 1024 * 1024]) {
    const p = planTtChunks(size);
    assert.equal(p.count, Math.floor(size / CHUNK), "count = floor(size / chunk) per TikTok's rule");
    assert.equal(p.ranges[0].start, 0);
    assert.equal(p.ranges[p.ranges.length - 1].end, size - 1, "last chunk reaches the final byte");
    // Ranges are contiguous with no gaps or overlaps.
    for (let i = 1; i < p.ranges.length; i++) assert.equal(p.ranges[i].start, p.ranges[i - 1].end + 1);
    // EVERY chunk (final one included) stays within TikTok's 64 MB ceiling.
    for (const rg of p.ranges) {
      const len = rg.end - rg.start + 1;
      assert.ok(len <= MAX_CHUNK, `chunk of ${len} bytes exceeds 64 MB for size ${size}`);
      assert.ok(len >= 5 * 1024 * 1024, "every chunk is at least 5 MB");
    }
  }
});

test("tt privacy picks the most public level available", () => {
  assert.equal(ttPickPrivacy(["SELF_ONLY", "PUBLIC_TO_EVERYONE"]), "PUBLIC_TO_EVERYONE");
  assert.equal(ttPickPrivacy(["SELF_ONLY", "FOLLOWER_OF_CREATOR"]), "FOLLOWER_OF_CREATOR");
  assert.equal(ttPickPrivacy(["SELF_ONLY"]), "SELF_ONLY", "unaudited apps only offer private");
  assert.equal(ttPickPrivacy([]), "SELF_ONLY", "safe default");
});

test("yt title uses the first caption line and guarantees #Shorts", () => {
  assert.equal(ytShortTitle("Morning routine tips\nlong description here"), "Morning routine tips #Shorts");
  assert.equal(ytShortTitle("Already tagged #shorts"), "Already tagged #shorts", "existing tag kept, case-insensitive");
  assert.equal(ytShortTitle(""), "New video #Shorts");
  const long = "x".repeat(200);
  assert.ok(ytShortTitle(long).length <= 100, "stays within YouTube's title limit");
});
