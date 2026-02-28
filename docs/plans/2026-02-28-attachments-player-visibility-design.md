# Attachmentlarni o'yinchilarga ko'rsatish

**Sana:** 2026-02-28
**Task:** #7

## Muammo

Host qo'shgan rasm va matn faqat host-ning lokal state-ida saqlanadi. O'yinchilar hech narsa ko'rmaydi.

## Dizayn

### Server-side (GameManager.js)
- `room.attachments = {}` — har cell uchun attachment
- `setAttachment(socketId, { ti, ni, type, content })` — saqlash
- `removeAttachment(socketId, { ti, ni })` — o'chirish
- `getGameState()` — attachments ni broadcast qilish

### Socket events (index.js)
- `set-attachment` (host → server) — `{ ti, ni, type, content }`
- `remove-attachment` (host → server) — `{ ti, ni }`

### HostGameScreen.jsx
- `localAttachments` o'rniga `gameState.attachments` dan o'qish
- Matn: to'g'ridan-to'g'ri `set-attachment` yuborish
- Rasm: FileReader orqali base64 ga convert, keyin `set-attachment` yuborish
- Hajm cheklovi yo'q

### PlayerGameScreen.jsx
- Aktiv savol uchun `gameState.attachments[cellKey]` ni ko'rsatish
- Matn: styled div, Rasm: `<img src={base64}>` tag
