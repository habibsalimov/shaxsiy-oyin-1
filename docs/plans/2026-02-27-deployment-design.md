# Shaxsiy O'yin — Deployment Design

**Date:** 2026-02-27
**Domain:** shaxsiy.ishlar.app
**Method:** Cloudflare Tunnel + PM2

---

## Architecture

```
Browser → shaxsiy.ishlar.app (Cloudflare DNS/CNAME)
       → Cloudflare Tunnel "shaxsiy-oyin"
       → localhost:3010 (Express + Socket.IO)
            ├── GET /*       → dist/ static files (React SPA)
            └── /socket.io   → WebSocket (game logic)
```

Single Node.js process serves both static frontend and WebSocket backend. Cloudflare Tunnel exposes it securely without a public IP. SSL handled by Cloudflare (Full mode).

---

## Components

### 1. Production Build
- `npm run build` → Vite outputs to `dist/`
- Express serves `dist/` with SPA fallback (`/{*splat}` → `index.html`)
- No frontend code changes needed — `io()` connects to same origin

### 2. Cloudflare Tunnel
- New tunnel: `shaxsiy-oyin`
- Config: `~/.cloudflared/shaxsiy-oyin.yml`
- Routes `shaxsiy.ishlar.app` → `http://localhost:3010`
- WebSocket support is built-in (transparent proxy)

### 3. DNS
- CNAME record: `shaxsiy.ishlar.app` → `<tunnel-uuid>.cfargotunnel.com`
- Created via `cloudflared tunnel route dns`

### 4. Process Management (PM2)
- `shaxsiy-oyin-server`: `node server/index.js` (Express + Socket.IO on :3010)
- `shaxsiy-oyin-tunnel`: `cloudflared tunnel run shaxsiy-oyin`
- `pm2 startup` + `pm2 save` for persistence across reboots
- `ecosystem.config.cjs` in project root

---

## Config Files

### `~/.cloudflared/shaxsiy-oyin.yml`
```yaml
tunnel: <tunnel-uuid>
credentials-file: /home/ailabs/.cloudflared/<tunnel-uuid>.json

ingress:
  - hostname: shaxsiy.ishlar.app
    service: http://localhost:3010
  - service: http_status:404
```

### `ecosystem.config.cjs` (project root)
```javascript
module.exports = {
  apps: [
    {
      name: "shaxsiy-oyin-server",
      script: "server/index.js",
      cwd: "/home/ailabs/private_game",
      env: { PORT: 3010, NODE_ENV: "production" },
    },
    {
      name: "shaxsiy-oyin-tunnel",
      script: "cloudflared",
      args: "tunnel --config /home/ailabs/.cloudflared/shaxsiy-oyin.yml run shaxsiy-oyin",
      autorestart: true,
    },
  ],
};
```

---

## Constraints

- Backend is stateful (in-memory). Single process only — no horizontal scaling.
- Machine must stay online for the service to work.
- No CI/CD — manual `npm run build` + `pm2 restart` for updates.
