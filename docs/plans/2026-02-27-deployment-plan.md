# Shaxsiy O'yin Deployment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deploy the Shaxsiy O'yin app to `shaxsiy.ishlar.app` via Cloudflare Tunnel + PM2.

**Architecture:** Express+Socket.IO server on localhost:3010 exposed through a Cloudflare Tunnel. PM2 manages both the Node.js server and the tunnel process. Cloudflare handles DNS, SSL, and proxying (including WebSocket).

**Tech Stack:** Cloudflare Tunnel (cloudflared CLI), PM2, Node.js/Express, Vite build

---

### Task 0: Production Build

**Files:**
- Existing: `package.json` (has `build` script)
- Output: `dist/` directory

**Step 1: Run the production build**

```bash
cd /home/ailabs/private_game && npm run build
```

Expected: Vite outputs bundled files to `dist/` with no errors.

**Step 2: Verify the build output**

```bash
ls -la /home/ailabs/private_game/dist/
ls /home/ailabs/private_game/dist/assets/
```

Expected: `index.html` + `assets/` folder with `.js` and `.css` files.

**Step 3: Quick smoke test — start production server**

```bash
cd /home/ailabs/private_game && PORT=3010 node server/index.js &
sleep 2
curl -s http://localhost:3010/ | head -5
kill %1
```

Expected: HTML response containing `<div id="root">` — confirms Express serves the built SPA.

---

### Task 1: Create Cloudflare Tunnel

**Prerequisites:** `cloudflared` is installed at `/home/ailabs/.local/bin/cloudflared`, authenticated with `~/.cloudflared/cert.pem`.

**Step 1: Create the tunnel**

```bash
cloudflared tunnel create shaxsiy-oyin
```

Expected: Output like `Created tunnel shaxsiy-oyin with id <UUID>`. A credentials JSON file is created at `~/.cloudflared/<UUID>.json`.

**Step 2: Note the tunnel UUID**

```bash
cloudflared tunnel list | grep shaxsiy-oyin
```

Expected: Shows the tunnel with its UUID. Save this UUID for the config file.

**Step 3: Verify credentials file exists**

```bash
ls ~/.cloudflared/*.json
```

Expected: A file like `~/.cloudflared/<UUID>.json` exists.

---

### Task 2: Configure Tunnel Routing

**Files:**
- Create: `~/.cloudflared/shaxsiy-oyin.yml`

**Step 1: Create the tunnel config file**

Create `~/.cloudflared/shaxsiy-oyin.yml` with the following content (replace `<UUID>` with the actual tunnel UUID from Task 1):

```yaml
tunnel: <UUID>
credentials-file: /home/ailabs/.cloudflared/<UUID>.json

ingress:
  - hostname: shaxsiy.ishlar.app
    service: http://localhost:3010
  - service: http_status:404
```

**Step 2: Validate the config**

```bash
cloudflared tunnel --config ~/.cloudflared/shaxsiy-oyin.yml ingress validate
```

Expected: `OK` — config is valid.

**Step 3: Create DNS route**

```bash
cloudflared tunnel route dns shaxsiy-oyin shaxsiy.ishlar.app
```

Expected: Creates a CNAME record `shaxsiy.ishlar.app` → `<UUID>.cfargotunnel.com`. If it already exists, it will say so.

---

### Task 3: Test Tunnel Manually

**Step 1: Start the Express server in background**

```bash
cd /home/ailabs/private_game && PORT=3010 node server/index.js &
```

**Step 2: Start the tunnel in foreground (test mode)**

```bash
cloudflared tunnel --config ~/.cloudflared/shaxsiy-oyin.yml run shaxsiy-oyin
```

Expected: Logs show `Connection registered` with connIndex 0, 1, 2, 3.

**Step 3: Test from another terminal (or curl)**

```bash
curl -s -o /dev/null -w "%{http_code}" https://shaxsiy.ishlar.app/
```

Expected: `200` — the site is live.

**Step 4: Test WebSocket connectivity**

```bash
curl -s -o /dev/null -w "%{http_code}" "https://shaxsiy.ishlar.app/socket.io/?EIO=4&transport=polling"
```

Expected: `200` — Socket.IO polling endpoint responds.

**Step 5: Stop both processes**

```bash
# Stop tunnel (Ctrl+C in its terminal)
# Stop Express
kill %1
```

---

### Task 4: Create PM2 Ecosystem Config

**Files:**
- Create: `/home/ailabs/private_game/ecosystem.config.cjs`

**Step 1: Create the ecosystem config**

Create `/home/ailabs/private_game/ecosystem.config.cjs`:

```javascript
module.exports = {
  apps: [
    {
      name: "shaxsiy-oyin-server",
      script: "server/index.js",
      cwd: "/home/ailabs/private_game",
      env: {
        PORT: 3010,
        NODE_ENV: "production",
      },
      max_memory_restart: "200M",
      exp_backoff_restart_delay: 100,
    },
    {
      name: "shaxsiy-oyin-tunnel",
      script: "/home/ailabs/.local/bin/cloudflared",
      args: "tunnel --config /home/ailabs/.cloudflared/shaxsiy-oyin.yml run shaxsiy-oyin",
      autorestart: true,
      max_memory_restart: "150M",
    },
  ],
};
```

**Step 2: Verify syntax**

```bash
node -e "const c = require('/home/ailabs/private_game/ecosystem.config.cjs'); console.log(JSON.stringify(c.apps.map(a=>a.name)))"
```

Expected: `["shaxsiy-oyin-server","shaxsiy-oyin-tunnel"]`

---

### Task 5: Start Services with PM2

**Step 1: Stop any existing dev server**

```bash
# Kill any node/vite processes on port 3010 or 5175
lsof -ti:3010 | xargs kill 2>/dev/null; lsof -ti:5175 | xargs kill 2>/dev/null
echo "Ports cleared"
```

**Step 2: Start PM2 with ecosystem config**

```bash
cd /home/ailabs/private_game && pm2 start ecosystem.config.cjs
```

Expected: PM2 shows both processes as `online`.

**Step 3: Verify both processes are running**

```bash
pm2 status
```

Expected: `shaxsiy-oyin-server` = online, `shaxsiy-oyin-tunnel` = online.

**Step 4: Check server logs**

```bash
pm2 logs shaxsiy-oyin-server --lines 5
```

Expected: `Server running on port 3010`.

**Step 5: Check tunnel logs**

```bash
pm2 logs shaxsiy-oyin-tunnel --lines 10
```

Expected: `Connection registered` messages — tunnel is connected to Cloudflare edge.

**Step 6: Save PM2 process list for persistence**

```bash
pm2 save
```

Expected: `[PM2] Successfully saved in /home/ailabs/.pm2/dump.pm2`

---

### Task 6: Verify Live Deployment

**Step 1: Test HTTPS access**

```bash
curl -s -o /dev/null -w "%{http_code}" https://shaxsiy.ishlar.app/
```

Expected: `200`.

**Step 2: Test HTML content**

```bash
curl -s https://shaxsiy.ishlar.app/ | grep -o '<div id="root">'
```

Expected: `<div id="root">` — SPA is served.

**Step 3: Test Socket.IO polling**

```bash
curl -s "https://shaxsiy.ishlar.app/socket.io/?EIO=4&transport=polling" | head -c 100
```

Expected: Response starting with `0{` — Socket.IO handshake response.

**Step 4: Full browser test with Playwright**

```bash
cd /tmp && python3 -c "
from playwright.sync_api import sync_playwright
with sync_playwright() as pw:
    b = pw.chromium.launch(headless=True)
    p = b.new_page()
    p.goto('https://shaxsiy.ishlar.app/', timeout=15000)
    p.wait_for_timeout(3000)
    p.screenshot(path='/tmp/deploy-test.png')
    title = p.query_selector('h1')
    print(f'Title: {title.inner_text() if title else \"NOT FOUND\"}')
    status = p.query_selector('text=Server bilan ulanildi')
    print(f'Socket connected: {\"YES\" if status else \"NO\"}')
    b.close()
"
```

Expected: Title contains "SHAXSIY O'YIN", Socket connected = YES.

---

### Task 7: Commit and Push

**Step 1: Commit ecosystem config**

```bash
cd /home/ailabs/private_game
git add ecosystem.config.cjs
git commit -m "feat: add PM2 ecosystem config for production deployment"
```

**Step 2: Push to GitHub**

```bash
git push origin master
```

---
