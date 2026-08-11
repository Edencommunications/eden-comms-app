// Unit tests for the msgs/unread mark sanitizer.
import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeMarks } from "../msgUnread";

const A = "1dba3d2d-f402-45be-a90a-b3710cb60a83";
const B = "9ed40726-ddc4-4c69-88fd-fb05ad691600";

test("keeps valid uuids, drops junk", () => {
  assert.deepEqual(sanitizeMarks([A, "not-a-uuid", B, 42, null, ""]), [A, B]);
});

test("dedupes while preserving order", () => {
  assert.deepEqual(sanitizeMarks([A, B, A, B]), [A, B]);
});

test("non-array input yields empty list", () => {
  assert.deepEqual(sanitizeMarks(null), []);
  assert.deepEqual(sanitizeMarks("x"), []);
  assert.deepEqual(sanitizeMarks({ 0: A }), []);
});

test("caps the list at 100 marks", () => {
  const many = Array.from({ length: 150 }, (_, i) =>
    `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`);
  assert.equal(sanitizeMarks(many).length, 100);
});
