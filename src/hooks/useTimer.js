import { useState, useEffect } from "react";
import { getSyncedNow } from "../utils/serverTime.js";

export function useTimer(timerEnd, timerSec) {
  const [rem, setRem] = useState(timerSec);
  useEffect(() => {
    if (!timerEnd) { setRem(timerSec); return; }
    const tick = () => setRem(Math.max(0, (timerEnd - getSyncedNow()) / 1000));
    tick();
    const iv = setInterval(tick, 80);
    return () => clearInterval(iv);
  }, [timerEnd, timerSec]);
  return rem;
}
