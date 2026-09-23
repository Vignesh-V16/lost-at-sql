# LOST AT SQL — Operation: Black Cipher

> **17 September 2045. 09:58 AM.** The lab enters lockdown: *"WARNING — BLACK CIPHER PROTOTYPE NOT FOUND."* No doors forced. No windows broken. The thief was already inside. The only evidence left is the institute's database.

A production-grade, real-time platform for a one-hour **SQL investigation event**, built on a reusable **SQL Investigation Game Engine**. Participants are investigators querying a read-only forensic database; the server validates their **result sets** (not their SQL text), awards evidence, moves suspects on the board and unlocks the next file; coordinators run the event from a live command center.

The gameplay — six files, hints, penalties, suspect states, the final deduction — is transcribed verbatim from the original `lost-in-sql.html` prototype. The architecture is documented in [`docs/ENGINE_ARCHITECTURE.md`](docs/ENGINE_ARCHITECTURE.md).

Difficulty: **beginner** — every file is solvable with `SELECT`, `WHERE`, `AND`, `BETWEEN`, `ORDER BY` and at most one `JOIN` or sub-query.

---

## Contents

- [Stack](#stack)
- [Quick start](#quick-start)
- [Default credentials](#default-credentials)
- [Running an event](#running-an-event)
- [How the game works](#how-the-game-works)
- [The engine](#the-engine)
- [Project structure](#project-structure)
- [API](#api)
- [Real-time events](#real-time-events)
- [Security](#security)
- [Tests](#tests)
- [Customising / building a new case](#customising--building-a-new-case)
- [Production deployment](#production-deployment)
- [Troubleshooting](#troubleshooting)
- [Case solution (coordinators only)](#case-solution-coordinators-only)

---

## Stack

The front end is drawn as a **classic comic book**: cream paper, thick ink borders, hard offset shadows, yellow narrator captions, speech bubbles for briefings and starbursts for verdicts. Lettering is *Bangers* (titles, buttons, labels) and *Comic Neue* (body); SQL stays in *JetBrains Mono*. Motion is deliberate — panels slam in, bursts pop, rows slide like caption boxes — and everything respects `prefers-reduced-motion`.

| Layer | Technology |
|---|---|
| Frontend | React 18 · Vite 5 · Tailwind CSS 3 · Framer Motion 11 · Lucide · Monaco Editor · React Router 6 |
| Backend | Node.js 20+ · Express 4 · Socket.IO 4 · Zod · Helmet · express-rate-limit |
| Application DB | MongoDB 6+ (Mongoose 8) — accounts, content, sessions (with embedded score ledger), query attempts, leaderboard, audit |
| Investigation DB | sql.js (SQLite → WebAssembly), rebuilt in memory from the dataset and executed in a **pool of worker threads** in `query_only` mode with a hard timeout — no credentials, no network, nothing to modify |
| Auth | Short-lived access JWT + rotating refresh tokens with reuse detection; bcrypt-hashed access codes; role checks on every route and socket |

No native build tools are required (bcryptjs and sql.js are pure JS/WASM), so it installs cleanly on Windows, macOS and Linux.

---

## Quick start

**Prerequisites**

- Node.js **20 or newer** (`node -v`)
- MongoDB **6 or newer** running locally (a standalone `mongod` is fine — transactions are not required), or a MongoDB Atlas connection string
- Internet access the first time (Google Fonts are loaded at runtime; everything else — including the Monaco editor — is bundled locally so the app works on venue Wi-Fi with no outside access)

**1. Install** (from the project root — it is an npm workspace, one install covers client and server)

```bash
npm install
```

**2. Configure the backend**

```bash
# Windows (PowerShell)
Copy-Item server\.env.example server\.env
# macOS / Linux
cp server/.env.example server/.env
```

Open `server/.env` and set at least:

```ini
MONGODB_URI=mongodb://127.0.0.1:27017/lost_at_sql
JWT_SECRET=<a long random string — at least 32 characters>
```

Generate a secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.

**3. Seed the database** (event, coordinator account, the six case files, evidence catalogue, dataset and eight demo participants)

```bash
npm run seed
```

The seed prints the coordinator credentials and the demo participants' access codes **once**. `npm run seed -- --keep` only adds what is missing.

**4. Run**

```bash
npm run dev
```

- Client: <http://localhost:5173>
- API: <http://localhost:5000/api/health>

Sign in as the coordinator → **Command → Start the investigation**. Participants sign in, watch the intro film (a rendered two-minute anime motion comic of the story), press **Begin Investigation** — their own 60-minute clock starts at that moment.

---

## Default credentials

| Role | ID | Access code | Notes |
|---|---|---|---|
| Coordinator | `coordinator` | `BLACK-CIPHER-2045` | From `SEED_COORDINATOR_ID` / `SEED_COORDINATOR_CODE` in `.env` — change them |
| Participant | `vignesh` | `cipher-7741` | Team BLACK OPS |
| Participant | `ananya` | `cipher-0932` | Team BLACK OPS |
| Participant | `rohan` | `cipher-1156` | Team NIGHT WATCH |
| Participant | `meera` | `cipher-1401` | Team NIGHT WATCH |
| Participant | `arjun` | `cipher-0958` | Team CIPHER SIX |
| Participant | `divya` | `cipher-0947` | Team CIPHER SIX |
| Participant | `karthik` | `cipher-2045` | Team GHOST PROTOCOL |
| Participant | `sneha` | `cipher-0939` | Team GHOST PROTOCOL |

Real participants are created in **Command → Participants** (one at a time, or bulk-pasted `id, name, team, code` lines). Codes are hashed with bcrypt and shown once.

---

## Running an event

The coordinator has three screens: **Command**, **Participants**, **Settings**. Participants have one.

1. **Before**: create participants and teams (**Participants**); set the event name, duration and scoring (**Settings**).
2. **Start** (**Command**). The event goes LIVE. Participants watch the story and press Begin; each session gets `startedAt` / `expiresAt` from the server.
3. **During**: keep **Command** open — the event clock and controls, three counters (investigating / closed / time up), the broadcast box, and the live **results table** (rank, score, files closed, current file, time left, hints, last seen), exportable as CSV at any time. **Pause** freezes every clock (and shifts every deadline on resume); **+5/+10/+15 min** extends everyone.
4. **End** expires every active session and freezes scores; participants can still read their results and evidence. A finished event cannot be restarted — **Reset** (typed confirmation) returns it to standby.

### The intro film

`client/public/intro.mp4` is a rendered 108-second film (1080p, 30 fps, silent) built from the fifteen illustrated panels in `client/public/intro/` (upscaled 4× with Real-ESRGAN, see `tools/film/upscale/`) — the official story introduction from `docs/intro-brief.md`: the world, Black Cipher, 09:58, the disappearance, the impossible scene, the sources, the database, the terminal, the CHRONOS hand-off, the mission, the case files, the clock, the participant's view, the question, and the title. The panels carry no lettering of their own: the artwork's captions were inpainted away (the lettered originals are in `tools/film/originals/`) and every word is typeset live, larger and in a comic hand (impact lettering with an ink outline, cream caption plates, glowing HUD text, a hand-written aside; lines slam, pop or type themselves in), from `client/src/components/intro/fx.js` — the one spec the pages and the film share, alongside the motion inside each slide: the page's number and title held still in screen space while the camera sways, artwork and rows materialising in sequence, signs pulsing, HUD rings turning around the AI core and the vanishing one, vehicles crossing the sky of page 1, light sweeps, lens streaks, a drifting light leak, bokeh, the blinking terminal cursor, the failing CCTV feeds flickering. It plays when a participant signs in and is the intro itself: ◀ ▶, the shot dots, Skip story and Watch again all move inside the film shot by shot, and the Begin button appears over its final frame. Without a film the same fifteen pages are drawn in the browser, silent, as GPU-composited CSS animations (in development, `/intro-preview?page=N` opens the intro on shot N). To change a word, edit `fx.js`; to replace a panel or re-render, see `tools/film/README.md`.

### The participant's screen

Sign in → the **intro film** (skippable, replayable, with sound) → **Begin**. From then on there is one page: the file tabs (FILE 01 … FINAL) and, under them, four section tabs:

| Tab | What's there |
|---|---|
| **Case file** | The Chief's brief for the open file, the tables in play (tap one for a five-row preview), hints, and a button to open the terminal |
| **Terminal** | The SQL editor, Run, the result grid and **Submit findings** (or the yes/no question on FILE 02). The FINAL file's terminal is a scratch editor for re-checking the data; its accusation form lives on the Case file tab |
| **Evidence record** | The suspect board, every piece of evidence recovered, the connections found, and the investigation log |
| **Story** | Replay the motion comic, or read the written briefing |

A new file opens on its Case file tab. Solving FINAL shows the reveal and the standings.

The intro is the fifteen-panel illustrated story (see `docs/intro-brief.md`): it establishes the world, what happened, what the participant has and what they must do — and never who, how, when exactly, or where.

---

## How the game works

```
BRIEFING → BEGIN (clock starts)
FILE 01 The Suspects           access_logs 09:45–09:58 → 6 employees become SUSPECTS, everyone else CLEARED
FILE 02 The Security Breach    who disabled the CCTV? + "was he on your list?" (No) → E103 FLAGGED
FILE 03 Inside Job             Project Black Cipher roster → non-members CLEARED
FILE 04 The Hidden Connection  Part A: external encrypted contact → PRIME SUSPECT
                               Part B: his internal encrypted contact → ACCOMPLICE (+ connection)
FILE 05 Follow the Money       the unverified offshore payment → FINANCIAL_MOTIVE
FINAL   Recover Black Cipher   thief · accomplice · time · method · location → CASE CLOSED → leaderboard
```

- **Result-set validation.** You run a query, look at the rows, then **Submit findings**. The server re-executes your SQL in the sandbox and validates the *result* (e.g. the set of `emp_id` values). Any correct query works; the SQL text is never pattern-matched.
- **Scoring** (prototype rules, configurable per event): start at **1000**; wrong finding **−25**; hint **−50** (charged once per file); wrong final deduction **−25**; floor 0. Every change is a ledger transaction on the session.
- **Not an attempt**: a result missing the `emp_id` column, a FILE 02 result that doesn't identify the administrator, or a yes/no submitted without the answer costs nothing — you just get the message.
- **FILE 05's starter query is deliberately too broad** (it returns five rows); narrow it.
- The **final deduction** gives per-field feedback (which fields to re-check) without revealing the answers.
- Everything — score, clock, unlocks, evidence, suspect states — is decided by the server. The browser only asks.

---

## The engine

`server/src/engine/` is pure and dependency-free:

| Module | Responsibility |
|---|---|
| `validators/` | `EXACT_SET`, `REQUIRED_ROWS`, `REQUIRED_COLUMN`, `BOOLEAN` (with a prior-result gate), `FIELD_MATCH`, `TIME_WINDOW`, `AGGREGATE`, `CUSTOM_EVIDENCE`, `ALL_OF`, `ANY_OF` — a registry, so a new strategy is one `registerValidator()` call |
| `finalValidator.js` | field-by-field final deduction (`EQUALS`, `ONE_OF`, `REGEX`, `CONTAINS`) |
| `scoring.js` | `ScoringPolicy`, transactions with idempotency keys, floor clamp, ledger verification |
| `suspectState.js` | data-driven suspect transitions (`resultSet` / `entity` / `all` / `list` rules) |
| `eventStateMachine.js` | DRAFT → READY → SCHEDULED → LIVE ⇄ PAUSED → ENDED → ARCHIVED |
| `clock.js` | event + session clocks from timestamps (never "remaining seconds") |
| `progression.js` | LOCKED / AVAILABLE / ACTIVE / COMPLETED for files and challenges |
| `leaderboard.js` | configurable ranking (`score:desc, completed:desc, elapsedMs:asc`) |

Content lives in `server/src/content/<case>/` (`dataset.js` + `case.js`) and is seeded into MongoDB, where coordinators can edit it. A new event ("OPERATION: RED PHANTOM") is a new content folder — no engine changes.

---

## Project structure

```
lost-at-sql/
├── package.json                 npm workspace (client + server)
├── docs/ENGINE_ARCHITECTURE.md  the 14-part architecture & prototype analysis
├── client/                      React SPA
│   └── src/
│       ├── contexts/            Auth · Event (event clock) · Session (participant's own clock + state)
│       ├── pages/play/          Investigate — the participant's single screen (story → begin → files → final)
│       ├── pages/command/       CommandCenter (controls · broadcast · results) · Participants · EventSettings
│       ├── components/intro/    the intro player: fx.js (every word and motion on the 15 pages) · typeset.js (shared layout maths) · scenes.jsx (the pages) · script.js (timing, cuts) · StoryIntro.jsx
│       └── public/intro/        panel-01…15.jpg — the illustrated story, without lettering; sprites/ — the cut-outs; public/intro.mp4 is rendered from them (tools/film/)
│       ├── components/play/     FilePanel · FinalPanel · EvidenceRail
│       ├── components/          SuspectBoard, FileTabs, RichText, SqlEditor (Monaco), Timer …
│       ├── components/ui/       the comic design system: Panel (ink border + hard shadow), captions, Bubble, Burst, Stamp, Button, Badge …
│       └── index.css + tailwind.config.js   paper/ink tokens, Ben-Day dot fields, comic keyframes
└── server/
    ├── src/engine/              pure game engine (see above)
    ├── src/content/             blackCipher/ (canonical) · temporalCore/ (experimental second dataset)
    ├── src/models/              User · Team · Event · CaseFile(+challenges,+hints) · EvidenceDefinition · DatabaseTable · InvestigationSession · QueryAttempt · Leaderboard · AuditLog · IdempotencyKey · RefreshToken
    ├── src/services/            session · challenge · final · scoring · outcome · leaderboard · event · reset · dataset · sql sandbox · auth · audit · monitor · admin
    ├── src/serializers/         participantView.js — the leak boundary
    ├── src/routes|controllers   REST API
    ├── src/middleware/          auth · idempotency · requestId · cookies · validate · rateLimit · errorHandler
    ├── src/sockets/             Socket.IO (notification-only)
    ├── src/scripts/seed.js
    └── tests/                   unit (engine, guard, golden content) + integration (real API + MongoDB)
```

---

## API

All responses are `{ success, data, requestId }` or `{ success:false, error:{ code, message }, requestId }`. Every request may carry `X-Request-Id`; mutating game actions may carry `Idempotency-Key` (retries replay the stored response).

**Auth** — `POST /api/auth/login` · `POST /api/auth/refresh` (rotating; reuse revokes the family) · `POST /api/auth/logout` · `GET /api/auth/me`

**Participant**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/events/current` | public event state + clock |
| GET | `/api/investigation/briefing` | classified briefing |
| POST | `/api/investigation/start` | create-or-resume the session (idempotent) |
| GET | `/api/investigation/session` | full authoritative view |
| GET | `/api/investigation/current-file` · `/progress` · `/queries` | |
| GET | `/api/cases/:code` · `/api/cases/:code/schema` | file view (no answers, no hint text) |
| POST | `/api/cases/:code/query` | `{ sql }` → rows + `queryAttemptId` |
| POST | `/api/cases/:code/hints/:hintId/use` | idempotent; returns the text and the penalty applied |
| POST | `/api/cases/:code/submit` | `{ queryAttemptId \| sql, answer? }` → validated server-side |
| GET | `/api/final` · POST `/api/final/query` · POST `/api/final/submit` | final deduction |
| GET | `/api/evidence` · `/api/evidence/:code` · `/api/database/schema` · `/api/database/tables/:name/sample` · `/api/leaderboard` | |

**Coordinator** (`/api/admin/…`, coordinator role enforced server-side): `event` (GET/PATCH), `event/ready|schedule|start|pause|resume|extend|end|archive|reset|announce`, `participants` (CRUD, bulk, reset-credentials, reset-progress), `teams`, `sessions`, `sessions/:id`, `sessions/:id/adjust-score`, `sessions-ledger-check`, `query-attempts`, `leaderboard`, `cases` / `challenges` / `hints` / `evidence` (CRUD, locked while live unless `force`), `database/*`, `audit-logs`, `stats`, `monitor`.

---

## Real-time events

Sockets are **notification-only**; every action goes through REST.

- To everyone: `event:state`, `leaderboard:update`, `event:announcement`, `database:reset`, `cases:updated`
- To a participant: `session:update`, `timer:expired`, `session:reset`, `session:revoked`
- To coordinators: `monitor:update`, `stats:update`, `presence:update`, and the feed `PARTICIPANT_STARTED`, `FILE_STARTED`, `QUERY_EXECUTED`, `EVIDENCE_DISCOVERED`, `FILE_COMPLETED`, `HINT_USED`, `SCORE_CHANGED`, `FINAL_SUBMITTED`, `PARTICIPANT_COMPLETED`, `TIME_EXPIRED`, `CONNECTION_LOST`, `CONNECTION_RESTORED`, `SQL_BLOCKED` — ids, codes and counts only, never hints, answers or result rows.

---

## Security

- **SQL sandbox**: static guard (single `SELECT`/`WITH`; `INSERT UPDATE DELETE DROP ALTER CREATE INTO ATTACH PRAGMA …` and `sqlite_master` rejected), then a worker thread holding a `query_only` SQLite copy with an empty environment, a hard timeout (worker terminated and respawned) and row/length caps. Application-DB credentials never reach the sandbox.
- **Hidden data**: validation configs, reference queries, hint text, success narrative and the reveal are `select:false` in Mongo and stripped again by explicit serializers. The integration suite scans every participant response for them.
- **Auth**: bcrypt (12 rounds); access JWT (`JWT_EXPIRES_IN`, default 1 h); rotating refresh token (httpOnly cookie + body fallback) with reuse detection; `tokenVersion` revocation; login rate-limited.
- **Integrity**: the session document is the unit of atomicity — optimistic concurrency (`__v`) turns every change into a compare-and-swap, retried on conflict; score changes are ledger entries with unique keys; `Idempotency-Key` replays; content locked while live.
- **Audit**: insert-only collection (updates/deletes refused at the model layer) with actor, role, action, target, requestId, ip.
- Helmet, CORS allow-list, request-size limits, per-user rate limits on queries and submissions.

---

## Tests

```bash
npm test                 # everything (integration tests skip themselves without MongoDB/deps)
npm run test:unit        # engine, validators, SQL guard, golden content
npm run test:integration # real API + MongoDB — set MONGODB_URI_TEST to a throwaway database
```

The golden test executes every challenge's reference query against the dataset and asserts the validator accepts it (and rejects FILE 05's starter). The integration suite walks the whole event: auth + refresh rotation, lifecycle, start/resume, guard attacks, FILE 01 → FINAL with prototype queries, hints, ten concurrent submits, idempotency replay, pause/resume/end, reset, content lock.

---

## Customising / building a new case

- **Content lives in code**: the coordinator UI deliberately has no case editor or database manager — the case is fixed by the prototype. The admin API for content (`/api/admin/cases`, `/api/admin/database`) still exists for scripts and tests, locked while LIVE unless forced (audited).
- **A new case as code**: add `server/src/content/<slug>/dataset.js` and `case.js` (copy Black Cipher's shape), register it in `content/index.js`, set `Event.dataset`/slug and run `npm run seed`. Write a `referenceSql` for every challenge so the golden test covers it.
- **Scoring**: `ScoringPolicy` on the event — initial score, penalties, `hintPenaltyScope` (`file` = prototype, `hint`), time/completion bonuses, floor.

---

## Production deployment

- `npm run build` builds the client into `client/dist`; set `SERVE_CLIENT=1` and the API serves it (single process), or host `client/dist` on any static host with `/api` and `/socket.io` proxied to the server.
- Set `NODE_ENV=production`, a strong `JWT_SECRET`, `COOKIE_SECURE=1` behind HTTPS, `TRUST_PROXY=1` behind a reverse proxy, `CLIENT_ORIGIN` to your public origin.
- One process handles 500+ participants comfortably (queries are microseconds on a 50-row dataset); run more `SQL_POOL_SIZE` workers on bigger datasets. Sessions, ledgers and attempts are persisted, so a restart loses nothing — the server rebuilds the sandbox and the leaderboard on boot.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Invalid environment configuration` on start | Copy `.env.example` to `server/.env` and set `MONGODB_URI` + a 32+ char `JWT_SECRET` |
| `DB_UNAVAILABLE` | MongoDB is not running (`Get-Service MongoDB` on Windows) |
| Participants see "Investigation not started" | Press **Start the investigation** on the Command dashboard |
| "Time is up" immediately after Begin | The event clock ran out — extend or reset the event |
| `CONTENT_LOCKED` from the admin API | The event is live — end/reset it, or force the edit (audited) |
| Leaderboard looks stale | Command → recompute (rebuilds from sessions) |
| Upgrading from an earlier version | Run `npm run clean:legacy` once to delete superseded files, then `npm run seed` (the data model changed) |

---

## Case solution (coordinators only)

<details>
<summary>Spoiler</summary>

- **FILE 01**: E101, E102, E104, E105, E109, E112 (Research Lab entries between 09:45 and 09:58).
- **FILE 02**: E103 (Karthik Iyer) disabled the CCTV at 09:50:12 — he was **not** on the FILE 01 list (answer **No**).
- **FILE 03**: Black Cipher members E101, E102, E105, E112.
- **FILE 04 A**: E101 — external encrypted contact `X_Buyer_07` at 09:44. **B**: `contact_person` = E103.
- **FILE 05**: E101 — ₹52,00,000 from Zenith Offshore Holdings on 2045-09-16 (`source_account <> 'NovaTech Payroll'`).
- **FINAL**: thief **E101 Aditya Rao** · accomplice **E103 Karthik Iyer** · time **09:50–09:54** · method **CCTV disabled remotely by an insider accomplice** · location contains **loading dock** (Loading Dock B).

</details>
