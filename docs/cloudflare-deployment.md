# Cloudflare deployment

The Cloudflare deployment serves the Vite frontend with Workers Static Assets, stores each live room in its own SQLite-backed Durable Object, and stores completed results in D1. The existing Express/Socket.IO server remains available for rollback.

## Build and verify

Use Node.js 22.13 or later (the Worker unit tests use `node:sqlite`).

```sh
npm ci
npm test
npm run test:cloudflare
npm run build:cloudflare
npx wrangler d1 migrations apply shaxsiy-oyin-results --local
npx wrangler dev
```

In another terminal, run `npm run smoke:cloudflare`. Pass an HTTPS origin as the last argument to run against a deployed Worker. The smoke test creates a labeled room and a completed result; remove only that result after production verification.

`npm run build` retains Socket.IO for the Node server. Cloudflare must use `npm run build:cloudflare`, which sets `VITE_TRANSPORT=cloudflare`. Do not serve a Node build from the Worker.

## Authentication and deployment

Use a scoped Cloudflare API token through `CLOUDFLARE_API_TOKEN`. Do not put it in source, shell history, logs, or Wrangler configuration. Required permissions are Workers Scripts edit, D1 edit, Account Settings read, and, for domain cutover, Workers Routes edit, DNS edit, and Zone read on the specific account/zone.

```sh
npx wrangler d1 migrations apply shaxsiy-oyin-results --remote
npm run build:cloudflare
npx wrangler deploy --dry-run
npx wrangler deploy
```

## State and timers

Native WebSockets use `{ event, data }` envelopes. Clients create rooms using `POST /api/rooms`, then connect to `/ws?code=1234` and send `join-room` after the `connected` event. Host joins require the returned token. Heartbeats use the hibernation auto-response mechanism, allowing idle rooms to sleep.

Room state, stable player identities, moderation sets, and attachments are persisted across eviction. Timer deadlines and room cleanup use Durable Object alarms. Every incoming event also checks overdue deadlines, so a late buzzer cannot beat an expired timer while an alarm is delayed. Completed results are persisted to D1 before `game-finished` is delivered; failed writes remain pending for retry.

Rooms expire after three hours without game activity, or five minutes after completion. Existing live Node rooms cannot be carried across the change of transport. Perform cutover when no games are active.

## Results migration and cutover

1. Make a consistent SQLite backup using SQLite's backup API; copying only the live `.db` file can omit WAL writes.
2. Keep backups outside the repository with restricted filesystem permissions.
3. Import existing `game_results` rows with their original IDs, timestamps, and JSON data using `INSERT OR IGNORE`.
4. Compare every imported field against the snapshot, not just row counts.
5. Verify host and player flows at the workers.dev address, including reconnect, timer expiry, attachments, and saved results.
6. Recheck the origin for active connections and new results immediately before switching the custom domain.
7. Verify the actual public domain and historical result URLs after cutover.

## Rollback

Keep the original Node server and its SQLite database until the migration is accepted. Before returning traffic to Node, preserve any new D1 results and reconcile them into the SQLite database. Remove the Cloudflare custom domain and restore the original `A` record for `shaxsiy.turnirlar.uz` to `157.230.19.26` (DNS-only), then verify the public UI and API. DNS caches may delay traffic changes.

Deleting the old DigitalOcean droplet is a separate destructive operation requiring explicit approval. Stopping its application alone does not remove the droplet charge.

## Verified cutover — 2026-10-03

- Public domain: `https://shaxsiy.turnirlar.uz`
- Worker: `shaxsiy-oyin`, version `9d24fb38-ff31-41e2-882c-a2af8e02c210`
- D1: `shaxsiy-oyin-results`; all 393 original rows matched the SQLite snapshot field-for-field after migration.
- Verification: 40 existing/client tests, 6 Worker tests, production build, deployment dry run, and native WebSocket plus two-browser game flows on both workers.dev and the public domain.
- Public checks covered host/player creation and join, falstart, scoring, reconnection, timer pause/resume/expiry, attachments, topic creation, completed result retrieval, and an existing historical result.
- Only the four labeled verification results created by these tests were removed; the original 393 rows were retained.
- Source application and consistent SQLite backups were retained outside the repository. The origin droplet remains available for rollback and has not been deleted.

Browser verification is reproducible with `python3 scripts/cloudflare-browser-smoke.py https://shaxsiy.turnirlar.uz` using an installed Playwright Python runtime and Chromium.

## Git delivery scope

The migration PR starts from `origin/master`. The live cutover also shipped local clock-synchronization (`serverNow` in `game-state`, `src/utils/serverTime.js`), URL hash cleanup, and an SVG favicon; these are included as a separate commit so the PR matches what runs in production. Do not overwrite a deployed build with an older baseline that lacks them.

### Load-test follow-up

Worker version `dd8783c4-4251-4ebc-87d3-cf23f079afc3` adds burst fanout optimization and idempotent retries for explicitly transient room-creation RPC failures. The focused PR now passes 53 unit/regression tests. See [bounded load validation](cloudflare-load-test.md) for the initial failures, final measurements, and limitations.
