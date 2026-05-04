import test from "node:test";
import assert from "node:assert/strict";
import { toGoogleDocsPreviewUrl } from "../src/utils/documentLinks.js";

test("converts a Google Docs edit link to a preview link", () => {
  const previewUrl = toGoogleDocsPreviewUrl("https://docs.google.com/document/d/abc123XYZ/edit?tab=t.0");

  assert.equal(previewUrl, "https://docs.google.com/document/d/abc123XYZ/preview?rm=minimal");
});

test("rejects non-Google-Docs document links", () => {
  assert.equal(toGoogleDocsPreviewUrl("https://example.com/document/d/abc123XYZ/edit"), null);
});
