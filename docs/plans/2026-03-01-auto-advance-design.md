# Timer tugaganda avtomatik keyingi savolga o'tish

**Sana:** 2026-03-01

## Muammo

Timer tugaganda (hech kim buzz qilmagan) boshlovchi qo'lda "KEYINGI SAVOL" tugmasini bosishi kerak. Bu o'yin oqimini sekinlashtiradi.

## Yechim

### 1. `_findNextOpenCell(room, ti, ni)` helper

Joriy pozitsiyadan boshlab keyingi ochiq (done bo'lmagan) savolni topadi.

- **Done savol** = history da `correct`, `skipped`, yoki `no_answer` natija bor
- **Ochiq savol** = history bo'sh yoki faqat `wrong` natijalari bor (yoki reset qilingan)
- Mavzu ichida nominallar, keyin keyingi mavzular tekshiriladi
- Hech qanday ochiq savol qolmasa → `null`

### 2. `handleTimerExpiry()` — auto-advance

`no_answer` yozilgandan keyin `_findNextOpenCell()` chaqiriladi va topilgan savolga `activeCell` o'rnatiladi. Darhol, kechikishsiz.

### 3. `judge()` va `skipQuestion()` refactor

Hozirgi `ni + 1` linear advance logikasi `_findNextOpenCell()` helper ga almashtiriladi. Bu done savollarni avtomatik o'tkazib yuboradi.

## O'zgarishlar

Faqat `server/GameManager.js`:
- ~~`_findNextOpenCell()` — yangi helper~~ ✅ allaqachon mavjud (line 122)
- `handleTimerExpiry()` — advance logikasi qo'shiladi
- ~~`judge()` — advance qismi helper ga almashtiriladi~~ ✅ allaqachon qilingan (line 307)
- ~~`skipQuestion()` — advance qismi helper ga almashtiriladi~~ ✅ allaqachon qilingan (line 338)

Client-side o'zgarish kerak emas — `game-state` broadcast orqali yangi `activeCell` avtomatik qabul qilinadi.

## Implementation

`handleTimerExpiry()` da `no_answer` yozilgandan keyin:

```javascript
// Auto-advance to next open cell
const next = this._findNextOpenCell(room, ti, ni);
if (next) {
  room.activeCell = next;
  if (next.ti !== ti) {
    room.currentTopicIdx = next.ti;
    this._ensureTopicScores(room, next.ti);
  }
} else {
  room.activeCell = null;
}
```
