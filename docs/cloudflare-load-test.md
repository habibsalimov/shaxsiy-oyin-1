# Bounded Cloudflare load validation

Run with Node 22 or later against a running local Wrangler instance with the D1 migration applied:

```sh
node scripts/cloudflare-load.mjs --url http://localhost:8788
node scripts/cloudflare-load.mjs --url http://localhost:8788 --rooms 1 --players 100 --rounds 3
```

The default is `http://localhost:8787`, five simultaneous rooms, 20 players per room, and three questions. Each room has an additional host connection. Limits are ten rooms, 100 players per room, 300 players total, and ten questions. Each operation has a 30-second deadline. Each client retains only the latest payload per event type rather than an unbounded event log.

The script creates rooms and saved results, so use a local or dedicated test environment by default. A remote run requires explicit selection with `--url`; it is not read-only. It does not delete data or change deployment configuration. Each persisted result ID is printed immediately, followed by a final JSON summary containing all created room codes and result IDs. Use only those exact IDs for any authorized cleanup. A failed finish/fetch may require inspecting the specific created test room before cleanup; the script does not infer that an unacknowledged write did not occur.

## Assertions

- Every player connects and joins, and every participant sees the complete room roster.
- Every host and player sees a playing phase and a started timer for each question.
- Players submit a concurrent burst of buzzes; every participant converges on the same complete order, including the first buzzer, without duplicates or unknown players.
- Every participant sees the same scores after the host awards the first buzzer a correct answer.
- All observed state and buzz payloads belong to the expected room and uniquely named test players.
- One player per room disconnects and reconnects with the same identity and preserved scores, without duplicating the roster.
- All participants receive identical final results, and the saved result can be fetched with the expected roster and scores.

Queued answers are enabled so every player in a burst must be acknowledged. Latency compensation is disabled to make server order directly comparable across clients. This checks authoritative ordering and consistency; it does not establish real-world buzzer fairness or validate compensated timestamps.

## Measurements and limits

The report includes sample count, median, nearest-rank p95, and maximum elapsed milliseconds for room creation, connection/join, timer propagation to every participant, individual buzz acknowledgement, first host buzz update, convergence of the whole buzz burst, score propagation, reconnect, finish, and result fetch.

These are client-observed application confirmation times. They include network round trips, runtime queuing, serialization, and the load generator's own scheduling and parsing. They are **not server-only latency**. A single generator servicing every socket may inflate hot-room measurements. Small samples, particularly three rounds, do not estimate a stable production p95.

This bounded burst test does not establish maximum capacity, long-duration stability, worldwide latency, hibernation behavior, browser rendering performance, or actual billing. The separate smoke test covers timer expiry, pause/resume, attachments, host authorization, and idle rejoin.

## Local validation on 2026-10-03

Both scenarios passed against local Wrangler and local D1: 5 rooms × 20 players and 1 room × 100 players, each with three questions. All 200 joins, six reconnects, six finishes, and six saved-result reads passed. No order/score disagreement or cross-room leakage was detected.

| Scenario | Buzz acknowledgement median / p95 | Full burst convergence median / max |
| --- | --- | --- |
| 5 × 20 | 67.19 / 96.95 ms | 78.38 / 103.16 ms |
| 1 × 100 | 679.66 / 1572.85 ms | 1634.24 / 1793.99 ms |

The hot room was materially slower despite preserving correctness. These local observations are not a Cloudflare production latency or capacity guarantee. Remote validation should retain the same scope and report its measurements separately.

## Initial remote observations and follow-up

The initial remote 5 × 20 run returned HTTP 500 for two of five room-creation requests. The three created rooms completed successfully. A subsequent 5 × 20 run passed all 100 joins and five result round trips, and 15 additional creations in parallel batches of five all returned HTTP 201. The first failure's response body/exception was not captured, so its root cause is unconfirmed. The test now records a sanitized error excerpt and Cloudflare ray ID on failed creation.

The first remote 1 × 100 run preserved correctness but showed a 1846.60 ms median first-host buzz update and 2960.18 ms maximum full-burst convergence. These observations motivated encoding each broadcast once, coalescing later full-state updates within a burst, and avoiding redundant alarm writes. The first buzz still sends its timer-freeze state immediately, and every accepted event persists before transmission.

Room creation also gains bounded retries for explicitly retryable, non-overloaded Durable Object errors, with a persisted operation identifier to prevent duplicate creation if an RPC response is lost. This is resilience against documented transient errors, not evidence establishing the cause of the initial HTTP 500 responses.

The optimized local 1 × 100 run passed all checks, with a 9.02 ms median first-host update and 292.67 ms maximum full-burst convergence. Local results alone do not establish remote performance.

## Final remote validation on 2026-10-03

Worker version `dd8783c4-4251-4ebc-87d3-cf23f079afc3` passed both bounded scenarios at its workers.dev origin. Across the two runs, all 200 joins, six reconnects, six finishes, and six saved-result reads succeeded. No room creation errors, duplicate players, order/score disagreements, or cross-room leakage were observed in these final runs. Each scenario used three question rounds; these results are not a soak test or a capacity guarantee.

| Scenario | First host buzz median / max | Own buzz acknowledgement median / p95 | Full burst convergence median / max |
| --- | --- | --- | --- |
| 5 rooms × 20 players | 85.15 / 135.79 ms | 95.79 / 236.45 ms | 145.65 / 468.15 ms |
| 1 room × 100 players | 215.61 / 290.20 ms | 385.26 / 523.07 ms | 538.23 / 547.40 ms |

The final public-domain browser smoke test also passed host/player creation, joining, buzzing, judging, player refresh, default topic creation, and saved results without page errors. The isolated PR checkout passes 38 application/client tests and 15 Worker tests; the production checkout additionally contains two pre-existing clock synchronization tests outside this PR's scope.
