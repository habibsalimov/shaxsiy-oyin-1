import { useTimer } from '../../hooks/useTimer.js';

export function TimerDisplay({ timerEnd, timerSec }) {
  const rem = useTimer(timerEnd, timerSec);
  const pct = timerSec > 0 ? (rem / timerSec) * 100 : 0;
  const urgent = rem <= 5 && timerEnd;
  return (
    <div>
      <div style={{
        fontFamily: "'Anton', 'Arial Black', sans-serif", fontSize: 72, lineHeight: 1,
        textAlign: "center", color: urgent ? "#e63946" : "#f5c800", letterSpacing: "0.04em",
        animation: urgent ? "pulse 0.5s ease infinite alternate" : "none",
      }}>
        {Math.ceil(rem)}
      </div>
      <div style={{ height: 8, background: "#1e2940", borderRadius: 2, overflow: "hidden", marginTop: 10 }}>
        <div style={{
          height: "100%", width: `${pct}%`,
          background: urgent ? "#e63946" : "#f5c800", transition: "width 0.08s linear",
        }} />
      </div>
    </div>
  );
}
