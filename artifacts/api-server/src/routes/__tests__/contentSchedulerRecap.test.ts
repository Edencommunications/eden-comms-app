// Scheduler safety-net tests: media-kind URL enforcement, local-time math
// used by the weekly recap window, and the recap text itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isOurs, isImage, isVideo, OUR_PREFIX, localParts, buildWeeklyText } from "../contentScheduler";

test("media URLs must live in our bucket", () => {
  assert.equal(isOurs(`${OUR_PREFIX}i-123-abc-pic.jpg`), true);
  assert.equal(isOurs("https://evil.example.com/i-pic.jpg"), false);
  assert.equal(isImage("https://evil.example.com/i-pic.jpg"), false);
  assert.equal(isVideo("https://evil.example.com/v-clip.mp4"), false);
});

test("i-/v- prefixes enforce photo-vs-video; legacy unprefixed files are permissive", () => {
  assert.equal(isImage(`${OUR_PREFIX}i-1-a-pic.jpg`), true);
  assert.equal(isVideo(`${OUR_PREFIX}i-1-a-pic.jpg`), false, "an uploaded photo can never be scheduled as a video");
  assert.equal(isVideo(`${OUR_PREFIX}v-1-a-clip.mp4`), true);
  assert.equal(isImage(`${OUR_PREFIX}v-1-a-clip.mp4`), false);
  // Legacy uploads predate the prefixes — both checks pass.
  assert.equal(isImage(`${OUR_PREFIX}1699999-old.jpg`), true);
  assert.equal(isVideo(`${OUR_PREFIX}1699999-old.jpg`), true);
});

test("localParts computes tz-local date, weekday and hour", () => {
  // 2026-08-16T03:30Z is still Aug 15 (Saturday) 22:30 in Chicago (CDT, UTC-5).
  const lp = localParts("America/Chicago", new Date("2026-08-16T03:30:00Z"));
  assert.equal(lp.ymd, "2026-08-15");
  assert.equal(lp.weekday, 6, "Saturday");
  assert.equal(lp.hour, 22);
  // Same instant in UTC is Sunday 03:00.
  const utc = localParts("UTC", new Date("2026-08-16T03:30:00Z"));
  assert.equal(utc.ymd, "2026-08-16");
  assert.equal(utc.weekday, 0, "Sunday");
});

test("weekly recap covers all four platforms and totals views", () => {
  const posts: any[] = [
    {
      media_type: "video", caption: "Reel one", status: "published",
      published_at: "2026-08-10T14:00:00Z", scheduled_at: "2026-08-10T14:00:00Z",
      stats: {
        ig: { views: 1000, reach: 800, likes: 50, comments: 5, shares: 3, saved: 7, avg_watch_sec: 8.2 },
        fb: { views: 400, likes: 20, comments: 2 },
        tt: { views: 2500, likes: 300, comments: 12, shares: 40 },
        yt: { views: 900, likes: 100, comments: 6 },
      },
    },
    { media_type: "image", caption: "Photo", status: "failed", error: "boom", published_at: "2026-08-11T14:00:00Z", scheduled_at: "2026-08-11T14:00:00Z" },
  ];
  const text = buildWeeklyText(posts, "2026-08-09 – 2026-08-15");
  assert.match(text, /IG: 1,000 views/);
  assert.match(text, /TikTok: 2,500 views · 300 likes/);
  assert.match(text, /YouTube: 900 views/);
  assert.match(text, /2,500 TikTok views/);
  assert.match(text, /900 YouTube views/);
  assert.match(text, /FAILED: boom/);
  assert.match(text, /across 2 posts/);
});

test("weekly recap flags private TikTok posts instead of showing empty stats", () => {
  const posts: any[] = [{
    media_type: "video", caption: "Private one", status: "published",
    published_at: "2026-08-10T14:00:00Z", scheduled_at: "2026-08-10T14:00:00Z",
    stats: { tt: { note: "posted (video id not returned)" } },
  }];
  const text = buildWeeklyText(posts, "wk");
  assert.match(text, /TikTok: posted \(stats unavailable/);
});

test("empty week says so", () => {
  assert.match(buildWeeklyText([], "wk"), /No posts went out this week/);
});
