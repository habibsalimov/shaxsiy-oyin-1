import test from "node:test";
import assert from "node:assert/strict";
import { getHostDocumentKind } from "../src/utils/documentFiles.js";

test("detects docx files as convertible documents", () => {
  assert.equal(getHostDocumentKind({ name: "savollar.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "docx");
});

test("keeps pdf files in iframe mode", () => {
  assert.equal(getHostDocumentKind({ name: "savollar.pdf", type: "application/pdf" }), "frame");
});
