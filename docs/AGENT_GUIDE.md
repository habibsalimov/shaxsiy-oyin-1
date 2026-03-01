# Developer Agent uchun Yo'llanma

Bu hujjat Claude Code yoki boshqa AI developer agentiga "Shaxsiy O'yin" loyihasini ishga tushirish va u bilan ishlash bo'yicha ko'rsatmalar beradi.

---

## 1. Loyihani birinchi marta ishga tushirish

Agentga beriladigan prompt:

```
Loyihani development rejimida ishga tushir. Quyidagi qadamlarni ketma-ket bajaring:

1. `npm install` -- frontend bog'liqliklarini o'rnat
2. `cd server && npm install` -- server bog'liqliklarini o'rnat
3. `npm run dev` -- development serverni ishga tushir

Natijada ikkita jarayon parallel ishlaydi:
- Vite (frontend) -- http://localhost:5173
- Express + Socket.IO (backend) -- http://localhost:3010

Vite `/socket.io` so'rovlarini avtomatik ravishda backendga proxy qiladi.
Brauzerda http://localhost:5173 ochib tekshiring.
```

---

## 2. Loyiha tuzilmasini tushunish

```
Loyiha tuzilmasini o'rgan. Asosiy fayllar:

SERVER (server/ papkasi):
- server/index.js -- Express + Socket.IO server, barcha event handlerlar
- server/GameManager.js -- O'yin holati (state) boshqaruvi, xonalar, ballar
- server/db.js -- SQLite orqali tugagan o'yin natijalarini saqlash

FRONTEND (src/ papkasi):
- src/App.jsx -- Bosh komponent, socket eventlarni tinglaydi, ekranlarni almashtiradi
- src/socket.js -- Socket.IO klient (ulanish, event yuborish/qabul qilish)
- src/components/ -- UI ekranlar va komponentlar
- src/hooks/ -- Timer va responsive hooklar
- src/utils/ -- Konstantalar va ball hisoblash funksiyalari

CLAUDE.md faylini o'qi -- unda to'liq arxitektura hujjati bor.
```

---

## 3. Yangi feature qo'shish

### Frontend komponent qo'shish

```
src/components/ papkasiga yangi komponent qo'sh.

Qoidalar:
- Styling: faqat inline style ishlatiladi (CSS fayl yo'q)
- Ranglar: background #0a0e1a (qora-ko'k), accent #f5c800 (oltin), matn #e0e0e0
- Shriftlar: Anton (sarlavhalar), Montserrat (asosiy matn)
- UI primitivlar: src/components/ui/ papkasidan import qil (Btn, Card, Input, Label, Badge, Toggle)
- O'zbek tili: barcha matn o'zbekcha bo'lsin, apostrofni T konstantasidan ol:
  import { T } from '../utils/constants.js'
  `O${T}yin` -> O'yin
```

### Yangi Socket.IO event qo'shish

```
Yangi real-time event qo'shish uchun ikkala tomonni yangilash kerak:

1. SERVER (server/index.js):
   - io.on("connection") ichida yangi socket.on("event-nomi", ...) qo'sh
   - GameManager.js da tegishli logika methodini yoz
   - broadcastState(room) chaqirib state yangilashni yuborish

2. CLIENT (src/App.jsx yoki tegishli komponent):
   - onEvent("event-nomi", callback) bilan eventni tinglash
   - emitEvent("event-nomi", data) bilan eventni yuborish
   - src/socket.js dan import qil: import { onEvent, emitEvent } from '../socket.js'

Eslatma: Server yagona haqiqat manbai (single source of truth).
Barcha o'yin logikasi serverda bo'lishi kerak, client faqat ko'rsatadi.
```

---

## 4. Ball tizimi bilan ishlash

```
Ball (scoring) tizimini tushunish:

- src/utils/scoring.js -- getTotal(), rebuildSnapshots(), initScores() funksiyalari
- Har bir mavzu uchun ballar: playerId -> { nominal -> "correct" | "wrong" | null }
- __snapshot -- yig'ma ball, har bir o'zgarishda qayta hisoblanadi
- Nominallar: masalan [10, 20, 30, 40, 50] -- har bir savol uchun ball qiymati

Ball o'zgartirish faqat server orqali bo'ladi:
- "judge" eventi -- to'g'ri/noto'g'ri deb belgilash
- "correct-score" eventi -- qo'lda ball tuzatish (null -> correct -> wrong -> null sikli)
```

---

## 5. Xatolarni tuzatish (debugging)

```
Xatoni tekshirish uchun:

1. Server loglarini tekshir -- terminal chiqishida [connect], [disconnect] va xato xabarlari ko'rinadi
2. Brauzer consoleni tekshir -- Socket.IO ulanish holati, event yuborilishi
3. game-state eventini kuzat -- server har bir o'zgarishda to'liq state yuboradi

Umumiy muammolar:
- "Port already in use" -- oldingi jarayon to'xtamagan, `lsof -i :3010` bilan tekshir
- Socket ulanmayapti -- vite.config.js dagi proxy sozlamasini tekshir (target: localhost:3010)
- State yangilanmayapti -- server/index.js da broadcastState() chaqirilganini tekshir
```

---

## 6. Production build

```
Production uchun build qilish:

1. npm run build -- Vite frontend'ni dist/ papkasiga build qiladi
2. npm start -- Express dist/ dan statik fayllarni beradi + Socket.IO ishlaydi
3. PORT env o'zgaruvchisi orqali portni sozlash mumkin (default: 3010)

Production'da bitta server hammani boshqaradi:
- Statik fayllar (HTML, JS, CSS) -- Express static middleware
- WebSocket ulanishlar -- Socket.IO
- REST API -- /api/results (o'yin natijalari)
- SPA catch-all -- barcha boshqa yo'llar index.html ga yo'naltiriladi
```

---

## 7. Ko'p ishlatiladigan prompt namunalari

### Oddiy vazifalar

| Vazifa | Prompt |
|--------|--------|
| Loyihani ishga tushirish | `npm install && cd server && npm install && cd .. && npm run dev` buyruqlarini ketma-ket ishga tushir |
| Build qilish | `npm run build` bajaring va dist/ papkasini tekshiring |
| Yangi UI komponent | `src/components/ui/ papkasidagi mavjud komponentlarga o'xshab [NomKomponent].jsx yarating` |
| Xato tuzatish | `Server loglarini va brauzer consoleni tekshiring, keyin CLAUDE.md dagi arxitekturani o'qing` |

### Murakkab vazifalar

```
Yangi o'yin funksiyasini qo'shish:

1. Avval CLAUDE.md ni o'qi -- arxitektura va Socket.IO protokolini tushun
2. server/GameManager.js ga yangi method qo'sh
3. server/index.js ga yangi event handler qo'sh
4. src/ dagi tegishli komponentda eventni tinglash va yuborishni qo'sh
5. npm run dev bilan ishga tushirib tekshir
```

```
Mavjud komponentni o'zgartirish:

1. src/components/ dan tegishli faylni o'qi
2. Inline style ishlatilganini unutma -- CSS fayl yo'q
3. UI primitivlarni src/components/ui/ dan import qil
4. O'zbekcha matn uchun T konstantasini ishlat
5. Agar server state kerak bo'lsa, App.jsx dagi game-state eventini tekshir
```

---

## 8. Muhim eslatmalar

- **Server -- yagona haqiqat manbai.** Client hech qachon o'z holatini mustaqil o'zgartirmasligi kerak.
- **Inline style.** Hech qanday CSS fayl, CSS modullar yoki CSS framework ishlatilmaydi.
- **O'zbek tili.** Barcha foydalanuvchiga ko'rinadigan matn o'zbekcha (lotin yozuvida).
- **Reconnect logikasi.** `sessionStorage` ga session saqlanadi, socket qayta ulanganda avtomatik xonaga qaytadi.
- **Testlar yo'q.** Hozircha avtomatik testlar mavjud emas -- qo'lda tekshirish kerak.
