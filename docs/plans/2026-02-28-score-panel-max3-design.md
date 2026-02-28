# Score Panel — Max 3 ta ochiq jadval

**Sana:** 2026-02-28
**Task:** #6

## Muammo

Boshlovchi sahifasida barcha mavzu jadvallari birdaniga ochiq ko'rinadi. Ko'p mavzuli o'yinlarda sahifa juda uzun bo'lib ketadi.

## Dizayn

### Asosiy qoidalar

1. Har doim **max 3 ta** mavzu jadvali ochiq ko'rinadi
2. Yangi mavzu boshlaganda — eng eski ochiq jadval avtomatik collapse bo'ladi
3. Qo'lda collapse bo'lgan jadvalni ochganda — 3 tadan oshsa eng eskisi avtomatik yopiladi
4. Mobilda ham xuddi shunday logika

### Xulq misollari

- O'yin boshida: faqat 1-mavzu ochiq
- 2-mavzuga o'tilganda: 2-mavzu (tepada) + 1-mavzu (pastda) — ikkalasi ochiq
- 3-mavzuga o'tilganda: 3 + 2 + 1 — hammasi ochiq
- 4-mavzuga o'tilganda: 4 + 3 + 2 ochiq, **1-mavzu auto-collapse**

### Texnik o'zgarishlar

**HostGameScreen.jsx:**

1. `collapsedScores` state logikasini o'zgartirish:
   - `useEffect` — `currentTopicIdx` o'zgarganda oxirgi 3 ta mavzuni ochiq qoldirish, qolganlarini collapse
   - Toggle funksiyasida — agar 3 ta ochiq va yana bittasini ochmoqchi bo'lsa, eng eskisini yopish

2. Mavjud tuzilish saqlanadi:
   - Reverse tartibda renderlanadi
   - ScoreBoard komponenti o'zgarmaydi
   - Mustaqil scroll saqlanadi
