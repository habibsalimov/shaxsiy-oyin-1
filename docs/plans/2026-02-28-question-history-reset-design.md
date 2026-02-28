# Question History + Reset Cell Design

**Date:** 2026-02-28
**Task:** Trello #4 — O'ynalgan savollar tarixi ko'rinmayapti

## Problem

Done (tarixga aylangan) savollarda tarix paneli murakkab — har bir yozuv yonida individual BEKOR tugmasi bor. Foydalanuvchi soddaroq UI xohlaydi: tarix ko'rinsin, bitta "Natijani bekor qilish" tugmasi bo'lsin.

## Design

### Done savollar tarix paneli

When host clicks TARIX on a done cell:
1. History entries shown (read-only, no per-entry BEKOR)
2. Single "Natijani bekor qilish" button at bottom
3. Button resets ALL results for that cell and re-opens question form

### New server method: `resetCell(socketId, { ti, ni })`

1. Clear `cellData[key].history = []`
2. For all players: `topicScores[ti][playerId][nominal] = null`
3. Set `activeCell = { ti, ni }`
4. Clear `timerEnd`, `buzzOrder`, `falstartBlocked`
5. Broadcast updated state

### Files changed

- `server/GameManager.js` — add `resetCell()` method
- `server/index.js` — add `reset-cell` socket event
- `src/components/HostGameScreen.jsx` — remove per-entry BEKOR, add single reset button

### ScoreBoard cell click (correct-score) remains unchanged — separate feature.
