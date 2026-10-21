import test from "node:test";
import assert from "node:assert/strict";
import { getSyncedNow, resetServerTimeSync, syncServerTime } from "../src/utils/serverTime.js";

test("server time sync keeps timer math independent from local clock skew", () => {
  const originalNow = Date.now;

  try {
    Date.now = () => 10000;
    resetServerTimeSync();
    syncServerTime(4000);

    const timerEnd = 8000;
    const remainingSeconds = Math.max(0, (timerEnd - getSyncedNow()) / 1000);

    assert.equal(getSyncedNow(), 4000);
    assert.equal(remainingSeconds, 4);
  } finally {
    Date.now = originalNow;
    resetServerTimeSync();
  }
});
