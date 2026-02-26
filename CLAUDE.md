# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"Shaxsiy O'yin" — a single-page React app for running Zakovat quiz club individual games. A host creates a game with configurable topics, score nominals, timer, and falstart rules. Players buzz in to answer questions, and scores are tracked per-topic with running grand totals. Results are saved to localStorage and shareable via URL hash.

**Language:** All UI text is in Uzbek (Latin script). The `T` constant (`'\u2018'`) is used for the Uzbek apostrophe character (o'yin → o\u2018yin).

## Commands

```bash
# Install (no lockfile exists — generates a fresh one)
npm install

# Development server (Vite, default port 5173)
npm run dev

# Production build (outputs to dist/)
npm run build

# Preview production build
npm run preview
```

**Note:** The `package.json` is named `package-json.json` and the HTML entry point is `index-html.html` — these non-standard filenames need renaming to `package.json` and `index.html` respectively for Vite to work.

## Tech Stack

React 18 + Vite 5 with `@vitejs/plugin-react`. No routing library, state management library, CSS framework, or backend — pure inline styles and `useState`/`useEffect` throughout.

## Architecture

The entire app lives in a single file: `src/App.jsx` (~1730 lines). There is no component splitting or module separation.

### File Structure

```
index-html.html     ← HTML entry (needs rename to index.html)
package-json.json   ← Package manifest (needs rename to package.json)
vite-config.js      ← Vite config (non-standard name, normally vite.config.js)
src/
  main.jsx          ← React root mount
  App.jsx           ← Entire application (all components, logic, styles)
```

### App.jsx Sections (by line regions)

1. **localStorage adapter** (1-30) — `window.storage` polyfill wrapping `localStorage` with async get/set/delete/list API
2. **Constants & Utils** (34-134) — `MOCK_PLAYERS`, `NOMINAL_PRESETS` (score value sets), `MOCK_TOPICS`, scoring functions (`getTotal`, `rebuildSnapshots`, `initScores`), custom hooks (`useWindowWidth`, `useTimer`), game code generator
3. **Reusable UI components** (136-282) — `Btn`, `Badge`, `Card`, `Label`, `SectionToggle`, `Toggle`, `Input`, `TimerDisplay` — all inline-styled
4. **ScoreBoard** (284-397) — Responsive score table with per-nominal cells, click-to-toggle scoring for host, running totals with snapshot system across topics
5. **SettingsPanel** (399-460) — Timer duration, nominal preset selection, falstart toggle
6. **LandingScreen** (462-629) — Host game creation form + player join form (game code entry)
7. **HostGameScreen** (630-1333) — Core game management: lobby, topic navigation, cell-by-cell question flow (nominals within topics), buzz order display, timer control, falstart blocking, player management (block/remove), inline score editing, game finish with result export
8. **PlayerGameScreen** (1334-1523) — Buzz-in button (spacebar or tap), timer display, personal score view — currently uses hardcoded mock data
9. **ResultsScreen** (1524-1649) — Final rankings, per-topic score breakdowns, share link via URL hash, localStorage result loading
10. **App root** (1650-1727) — Tab-based navigation between all four screens, game state lifting

### Key Concepts

- **Nominals:** Point values per question (e.g., `[10, 20, 30, 40, 50]`). Six preset tiers available.
- **Topic scores:** Array of score objects per topic. Each entry maps `playerId → { nominal → "correct"|"wrong"|null }`.
- **Snapshots (`__snapshot`):** Cumulative grand totals embedded in each topic score entry via `rebuildSnapshots()` for efficient rendering of historical totals.
- **Cell data:** `cellData` tracks per-cell (topic+nominal) question state including buzz history, used for sequential question flow enforcement.
- **Falstart mode:** When enabled, players can't buzz until the host explicitly starts the timer.
- **`MOCK_PLAYERS`:** Hardcoded 4-player list used throughout — no real networking/WebSocket exists yet.

### Persistence

Results are saved to `localStorage` via the `window.storage` adapter. Results can be loaded from URL hash (`#results/{id}`).

### Styling

All components use inline `style` objects. Fonts: Anton (display) + Montserrat (body), loaded via Google Fonts CDN. Color palette: dark navy background (`#0a0e1a`), gold accent (`#f5c800`), muted blue-grays for secondary text.
