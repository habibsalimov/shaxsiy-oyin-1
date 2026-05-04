import test from "node:test";
import assert from "node:assert/strict";
import { getNextDocumentZoom } from "../src/utils/documentZoom.js";

test("document zoom increases and decreases in bounded steps", () => {
  assert.equal(getNextDocumentZoom(100, "in"), 110);
  assert.equal(getNextDocumentZoom(100, "out"), 90);
  assert.equal(getNextDocumentZoom(200, "in"), 200);
  assert.equal(getNextDocumentZoom(50, "out"), 50);
});

test("document zoom resets to actual size", () => {
  assert.equal(getNextDocumentZoom(160, "reset"), 100);
});
