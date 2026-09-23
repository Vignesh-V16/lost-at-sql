# LOST AT SQL — SQL Investigation Game Engine

**Backend architecture & analysis — Operation: Black Cipher**
Status: **implemented** (see §17 for what shipped and where the implementation deliberately deviates) · Source of truth: `lost-in-sql.html` prototype (54 KB, sql.js 1.8.0)

Priority order for every decision in this document: **DATA INTEGRITY → SECURITY → CORRECTNESS → GAME LOGIC → SCALABILITY → MAINTAINABILITY.**

---

## Contents

0. [Prototype reverse-engineering (facts, verified)](#0-prototype-reverse-engineering)
1. [Participant workflow](#1-reverse-engineered-participant-workflow)
2. [Investigation state machine](#2-investigation-state-machine)
3. [Domain model](#3-domain-model)
4. [Database architecture](#4-database-architecture)
5. [API architecture](#5-api-architecture)
6. [SQL execution / security architecture](#6-sql-execution--security-architecture)
7. [Challenge validation engine](#7-challenge-validation-engine)
8. [Evidence engine](#8-evidence-engine)
9. [Scoring engine](#9-scoring-engine)
10. [Timer / session architecture](#10-timer--session-architecture)
11. [Coordinator architecture](#11-coordinator-architecture)
12. [Concurrency & anti-cheat](#12-concurrency--anti-cheat-strategy)
13. [Failure / recovery](#13-failure--recovery-strategy)
14. [Testing strategy](#14-testing-strategy)
15. [Dataset comparison & decision](#15-dataset-comparison--decision)
16. [Implementation plan against the current codebase](#16-implementation-plan)

---

## 0. Prototype reverse-engineering

Everything in this section was read from the prototype's JavaScript, and every expected result set was re-executed against the prototype's own `SCHEMA_SQL` + `SEED_SQL` in SQLite to confirm the data actually produces it.

### 0.1 Investigation dataset (6 tables, 50 rows)

| Table | Columns | Rows | Notes |
|---|---|---|---|
| `employees` | emp_id PK, name, department, designation, email | 12 | E101–E112, NovaTech |
| `access_logs` | log_id PK, emp_id, door_name, access_time, access_type, remarks | 15 | Doors: Research Lab, Main Lobby, Server Room, Loading Dock B |
| `cctv_admin_logs` | log_id PK, emp_id, system_name, action, action_time | 3 | E103 disabled 09:50:12 / enabled 09:54:12 |
| `project_members` | emp_id, project_name | 8 | No PK; projects: Black Cipher, RoboArm Gen4, NovaShield Security |
| `communications` | comm_id PK, emp_id, contact_person, contact_type, message_type, comm_time | 6 | contact_type ∈ {internal, external}; message_type ∈ {normal, encrypted} |
| `transactions` | txn_id PK, emp_id, amount REAL, txn_date, source_account, remarks | 6 | One 5,200,000 from Zenith Offshore Holdings |

All timestamps are `TEXT` in `YYYY-MM-DD HH:MM:SS` (lexicographically sortable — this is why `BETWEEN` on strings works and the engine must keep the same storage type).

### 0.2 Canonical timeline (ground truth encoded in the data)

| Time | Fact | Table |
|---|---|---|
| 09-16 | ₹52,00,000 to E101 from Zenith Offshore Holdings, "Unverified – pending compliance review" | transactions #1 |
| 09:38:00 | E101 → E103 internal encrypted | communications #2 |
| 09:39:10 | E103 → E101 internal encrypted | communications #3 |
| 09:44:00 | E101 → X_Buyer_07 external encrypted | communications #1 |
| 09:46:10 | E101 enters Research Lab | access_logs #1 |
| 09:49:00 | E103 enters Server Room | access_logs #10 |
| 09:50:12 – 09:54:12 | E103 disables then re-enables Research Lab CCTV (4 min) | cctv_admin_logs #1,#2 |
| 09:56:00 | E103 exits Server Room | access_logs #15 |
| 09:57:45 | E101 exits via **Loading Dock B**, "Carrying large duffel bag – flagged by scanner" | access_logs #11 |
| 09:58 | Lockdown — "BLACK CIPHER PROTOTYPE NOT FOUND" | briefing |

E103 never badges into the Research Lab (verified: zero rows). E106 enters the lab at 09:20 — outside the window, so excluded.

### 0.3 The six files — exact rules

| File | Type | Tables shown | Validation rule (as coded) | Expected | Verified |
|---|---|---|---|---|---|
| FILE 01 The Suspects | `single` | employees, access_logs | `emp_id` column of first result set, upper-cased, **set-equal** to expected | {E101,E102,E104,E105,E109,E112} | ✅ starter query returns exactly this |
| FILE 02 The Security Breach | `yesno` | cctv_admin_logs | result set must equal {E103} **before** the Yes/No question renders; then answer must be **"no"** | {E103}, answer `no` | ✅ |
| FILE 03 Inside Job | `single` | project_members | set-equal | {E101,E102,E105,E112} | ✅ |
| FILE 04 Part A | `twopart`/part1 | communications | set-equal | {E101} | ✅ (single row, 09:44) |
| FILE 04 Part B | `twopart`/part2 | communications | result must include `emp_id` column (else "needs emp_id" error) **and** `contact_person` column must contain `E103` in **any** row | contact `E103` | ✅ |
| FILE 05 Follow the Money | `single` | transactions | set-equal | {E101} | ✅ — **but the starter query returns 5 rows** (E101,E112,E102,E105,E103). The participant must add a filter (e.g. `source_account <> 'NovaTech Payroll'` or `amount > 1000000`). This is the one file where the starter is deliberately insufficient. |
| FINAL Recover Black Cipher | form | (optional free query) | thief `=== 'E101'`; accomplice `=== 'E103'`; time matches `/^09:5[0-4]$/`; method `=== 'cctv'`; location lower-cased **contains** `'loading dock'` | see left | ✅ |

Validation always reads **only the first result set** (`res[0]`) and only checks `emp_id`. Extra columns, row order and duplicates are ignored (Set semantics). An empty result is a valid (wrong) submission.

Hidden behaviours worth preserving:

* On FILE 02 a *wrong result set* does **not** cost points — the Yes/No prompt simply doesn't appear ("Find the administrator who disabled the CCTV system first"). Only a wrong Yes/No answer costs −25.
* On FILE 04 Part A the prototype pre-checks the result client-side and changes the button label to "Confirm — Move to Part B" when correct. That is an answer leak; the engine must expose a single "submit" action whose outcome is only known after the server responds.
* On FILE 04 Part B the "wrong" feedback text is: *"Make sure your query includes the contact_person column and filters for E101's internal encrypted message."*

### 0.4 Suspect-state transitions (as coded in `applyEliminations` + inline code)

States: `unknown` (initial, all 12) → `suspect` | `cleared` | `flagged` | `prime` | `accomplice`.

| Trigger | Transition |
|---|---|
| FILE 01 solved | every employee in the result set → `suspect`; everyone else → `cleared` |
| FILE 02 solved | `E103` → `flagged` (person of interest) |
| FILE 03 solved | any current `suspect` **not** in result set → `cleared` (E104, E109) |
| FILE 04 Part A confirmed | `E101` → `prime` |
| FILE 04 Part B solved | `E103` → `accomplice` |
| FILE 05 solved | *no state change* (evidence only) |

**Discrepancy #1 —** `applyEliminations` contains a branch for round 4 (*clear every remaining `suspect` except E101*) but the FILE 04 code path never calls `applyEliminations`, so E102, E105, E112 stay `suspect` on the board to the end. The branch is clearly intended; see decision D-1.

### 0.5 Scoring (as coded)

* Initial 1000. Floor at 0 (`Math.max(0, …)` everywhere).
* Wrong finding submission −25 (FILE 01, 03, 04A, 04B, 05; FILE 02 Yes/No wrong).
* Hint −50, charged **once per file** (keyed by `round.id`). For FILE 04 one charge unlocks both the Part A and Part B hint texts (**Discrepancy #2**, see D-2).
* Wrong final submission −25, unlimited attempts, `finalWrong` counter (not persisted).
* No time bonus, no completion bonus. Score is frozen at final success.

### 0.6 Progression, navigation, persistence, timer, leaderboard

* Strictly sequential: `currentRound` advances only via "Continue to File 0N" after a file is `done`. Tabs for `id ≤ currentRound` are clickable (revisit, re-run queries; no re-submit); `id > currentRound` locked. FINAL unlocks when `currentRound ≥ 6`.
* Sidebar reads "N/6 files closed" (5 files + final = 6).
* Editor: any table may be queried, not just the chips shown. Schema chip = `SELECT * FROM t LIMIT 5`.
* Persistence: `window.storage` shared key `team:<name lower>` holding score, currentRound, roundStage, hintsUsed, status, startTime, finalAnswers, screen. Re-entering a team name **resumes** (skips briefing). Anyone who types the same team name takes over that team (no auth).
* Timer: count-up only. `startTime = Date.now()` at team registration — *before* the briefing. No expiry. Elapsed shown mm:ss.
* Leaderboard: entry `lbentry:<team>` = {team, score, elapsed} written **only on final success**; sorted score desc, elapsed asc; top 10.
* Case-closed reveal text and facts table (Thief Aditya Rao E101 · Accomplice Karthik Iyer E103 · ≈09:50–09:54 · CCTV disabled remotely, 4-minute blackout · Removed via Loading Dock B).

### 0.7 Decision log (prototype ambiguities → engine behaviour)

| # | Issue | Decision |
|---|---|---|
| D-1 | FILE 04 clearing branch unreachable | **Prototype behaviour preserved** (reviewer: no new gameplay rules): E102/E105/E112 stay `SUSPECT`. The intended rule ships commented out in `content/blackCipher/case.js` as a one-line opt-in. |
| D-2 | Hint charged once per file vs spec §19 "each hint" | **Prototype behaviour preserved**: `ScoringPolicy.hintPenaltyScope = "file"` (one −50 per file; FILE 04's two hints share it). `"hint"` scope is a settings toggle. |
| D-3 | Client-side pre-check leaks correctness (04A button label) | One uniform `submit` action; server returns outcome. UI never knows before submitting. |
| D-4 | Per-field final feedback (spec §17 wants it; it is brute-forceable) | Keep per-field booleans (spec requirement). Mitigate with configurable `finalAttemptPolicy` (default unlimited, −25 each, matching prototype) and audit. |
| D-5 | Timer starts at registration, before briefing | Session `startedAt` is set when the participant calls `POST /investigation/start` after reading the briefing (spec §42 "RECEIVE CASE BRIEFING → START TIMER"). Briefing is served un-timed. |
| D-6 | No expiry in prototype; spec mandates 60 min | `expiresAt = startedAt + event.durationMinutes` (default 60), bounded by the event's own end. |
| D-7 | Team name = identity | Real auth (participant credentials, teams assigned by coordinator). One session per participant; team is a grouping for the leaderboard. |
| D-8 | Any table queryable | Preserved by default (`queryScope: "dataset"`). `allowedTables` drives schema display; a strict mode `"allowedTables"` exists per event. |
| D-9 | `LOADING_DOCK_EXIT` evidence is in the spec but no round awards it | **No new mechanic**: it is awarded on a validated final deduction (the reveal names Loading Dock B). Passive discovery exists in the engine (`EvidenceDefinition.passiveTrigger`) but is unused by Black Cipher. |
| D-10 | Validation uses first result set only | Preserved: multi-statement input is rejected anyway (single statement policy). |
| D-11 | `project_members` has no PK | Engine requires each table to declare a primary key for import validation; a composite `(emp_id, project_name)` is declared in the dataset definition. |
| D-12 | Score floor 0 | Preserved as `ScoringPolicy.minimumScore = 0`. |

---

## 1. Reverse-engineered participant workflow

```
AUTHENTICATE (participant id + access code → access JWT + refresh cookie)
   │
VERIFY EVENT  (GET /events/current → state must be LIVE to start; PAUSED/ENDED are read-only)
   │
GET BRIEFING  (GET /investigation/briefing — un-timed; served once event is LIVE)
   │
START / RESUME SESSION  (POST /investigation/start → creates InvestigationSession or returns the existing one)
   │        startedAt = server now · expiresAt = startedAt + duration · status ACTIVE
   ▼
┌─────────────────────────── FILE LOOP (FILE 01 → 02 → 03 → 04A → 04B → 05) ───────────────────────────┐
│  GET  /cases/:code            brief, allowed tables, stage, attempts, hint availability (no answers)     │
│  GET  /cases/:code/schema     columns + 5 sample rows of allowed tables                                  │
│  POST /cases/:code/query      guarded SQL → sandbox → rows (≤500) → QueryAttempt → passive evidence      │
│  POST /cases/:code/hints/:id/use   idempotent: marks used, −50 once, returns text                        │
│  POST /cases/:code/submit     { queryAttemptId | sql, answer? }  → server re-executes → validator        │
│         ├─ correct  → atomic: stage/file COMPLETE, evidence awarded, suspect transitions, unlock next    │
│         └─ wrong    → atomic: attempt++, −25 (unless challenge says no penalty), failureMessage          │
└──────────────────────────────────────────────────────────────────────────────────────────────────────────┘
   │  (all five files COMPLETED)
FINAL FILE  (GET /final → 12 employee options, method options, no answer key)
   │  optional POST /final/query (same sandbox, no validation)
POST /final/submit  { thief, accomplice, time, method, location }
   ├─ wrong  → −25, { correct:false, fields:{…} }
   └─ right → session COMPLETED, completedAt, elapsedMs frozen, leaderboard upsert, reveal returned
   │
GET /leaderboard  (server-ranked)
```

Every arrow is a server decision. The client holds no authoritative state; on refresh it calls `GET /investigation/session` and re-renders whatever the server says.

---

## 2. Investigation state machine

### 2.1 Event (server-side, coordinator-driven)

```
DRAFT ──configure──► READY ──schedule──► SCHEDULED ──(auto at startsAt | start)──► LIVE
  ▲                    │                                                            │  ▲
  │                    └────────────────── start ───────────────────────────────────┘  │
  │                                                                       pause ▼      │ resume
  │                                                                          PAUSED ───┘
  │                                                                  end / watchdog ▼
  └──────── reset(RESET_EVENT) ◄──────────────────────────────────────────── ENDED ──archive──► ARCHIVED
```

Guards: `start` only from READY/SCHEDULED/PAUSED; `end` from LIVE/PAUSED; `start` from ENDED is **refused** (`EVENT_ALREADY_ENDED`) — an explicit `reset` is required. Transitions are compare-and-swap updates on `{ _id, state: <expected> }` so two coordinators cannot both start the event.

### 2.2 InvestigationSession

```
(none) ──start──► ACTIVE ──final correct──► COMPLETED
                    │ ▲
                    │ └─ resume (event PAUSED→LIVE)
                    ├─ expiresAt reached / event ENDED ──► TIME_EXPIRED
                    └─ coordinator reset ──► (deleted, audited) → (none)
```

`TIME_EXPIRED` and `COMPLETED` are terminal for the participant. Read endpoints still work; mutating endpoints return `423 SESSION_EXPIRED` / `409 SESSION_COMPLETED`.

### 2.3 CaseFile status per session

```
LOCKED ──(previous file COMPLETED)──► AVAILABLE ──(first GET)──► ACTIVE ──(all challenges COMPLETED)──► COMPLETED
```

FILE 01 starts `AVAILABLE`. FINAL becomes `AVAILABLE` when files 01–05 are `COMPLETED`. Completed files remain readable and queryable (prototype "revisit" behaviour) but `submit` on a completed challenge returns `409 CHALLENGE_ALREADY_COMPLETED` with the stored success payload (idempotent).

### 2.4 Challenge stage machine (within a file)

A file is an **ordered list of challenges**. FILE 04 has two (`FILE_04A`, `FILE_04B`); every other file has one. The file's `currentChallenge` is the first non-completed challenge. This is what the prototype's `roundStage ∈ {part1, part2, done}` collapses to. Stages never need bespoke code — a future file with three parts is three challenges.

### 2.5 Suspect state machine (per session, per entity)

```
UNKNOWN → SUSPECT | CLEARED
SUSPECT → CLEARED | PRIME_SUSPECT
CLEARED → PERSON_OF_INTEREST | ACCOMPLICE
PERSON_OF_INTEREST → ACCOMPLICE
```

Transitions are **declared in challenge config** (`onSuccess.transitions`), applied by the SuspectStateEngine, and every applied transition is appended to `session.timeline` (never overwritten — spec §13).

---

## 3. Domain model

Naming follows the spec. Fields marked ⚿ never leave the server through participant APIs.

| Entity | Key fields | Notes |
|---|---|---|
| **User** (base) | `_id`, `role` ∈ {participant, coordinator}, `displayName`, `passwordHash`, `tokenVersion`, `isActive` | Mongoose discriminator; `participantId`/`coordinatorId` login handles are unique |
| **Participant** | `participantId`, `team` → Team, `event` → Event | |
| **Coordinator** | `coordinatorId`, `permissions[]` | |
| **Team** | `name`, `code`, `event`, `members[]` | Leaderboard groups by participant by default; `rankBy: "team"` aggregates |
| **Event** | `slug`, `name`, `state`, `durationMinutes`, `startsAt?`, `startedAt`, `pausedAt`, `pausedTotalMs`, `extendedMs`, `endedAt`, `dataset` → Dataset, `scoringPolicy`, `leaderboardPolicy`, `queryScope`, `queryPolicy` {timeoutMs,maxRows,maxLength}, `briefing`, `reveal` ⚿, `finalChallenge` → Challenge ⚿ | One LIVE event per deployment is the default; model supports many |
| **Dataset** | `name`, `tables[]` {name, columns[{name,type,pk}], primaryKey[], rows[][]}, `version`, `checksum` | Application DB holds the *definition*; the sandbox is built from it |
| **CaseFile** | `event`, `sequence`, `code` ("FILE_01"), `title`, `brief`, `requiredPreviousFile`, `challenges[]` → Challenge (ordered), `unlockCondition`, `isFinal` | FINAL is a CaseFile with `isFinal:true` and one `FINAL_DEDUCTION` challenge |
| **Challenge** | `caseFile`, `sequence`, `code`, `kind` ∈ {RESULT_SET, RESULT_SET_THEN_BOOLEAN, FINAL_DEDUCTION}, `instructions`, `starterSql`, `allowedTables[]`, `validationStrategy` ⚿, `validationConfig` ⚿, `attemptPolicy` {maxAttempts?, wrongPenaltyOverride?, penaliseWrongResult:true}, `hints[]` → Hint, `successMessage` ⚿(until solved), `failureMessage`, `onSuccess` ⚿ {evidence[], transitions[], connections[]} | Prototype `type` maps: single→RESULT_SET, yesno→RESULT_SET_THEN_BOOLEAN, twopart→two RESULT_SET challenges |
| **Hint** | `challenge`, `sequence`, `text` ⚿, `penalty` (null → policy default) | Text returned only by the `use` endpoint |
| **EvidenceDefinition** | `event`, `code` (LAB_ENTRY_WINDOW…), `title`, `summary`, `source`, `relatedEntities[]`, `discovery` {mode: AWARD\|PASSIVE, trigger?} | Static catalogue |
| **InvestigationSession** | `event`, `participant`, `team`, `status`, `startedAt`, `expiresAt`, `completedAt`, `elapsedMs`, `lastActivityAt`, `score`, `currentFile`, `currentChallenge`, `files[]` {caseFile, status, openedAt, completedAt, challenges[] {challenge, status, attempts, completedAt, hintsUsed[]}}, `evidence[]` {definition, discoveredAt, via}, `connections[]`, `suspectStates` Map<entityId, state>, `timeline[]`, `finalSubmissions`, `version` | Unique `(event, participant)`. Optimistic `version` for CAS updates |
| **QueryAttempt** | `session`, `participant`, `event`, `caseFile`, `challenge`, `sql`, `sqlHash`, `executedAt`, `durationMs`, `rowCount`, `columns[]`, `success`, `errorType`, `errorMessage`, `resultHash`, `blockedReason?` | Result rows are **not** stored (re-executed on submit) — small, deterministic dataset |
| **ScoreTransaction** | `session`, `type` ∈ {INITIAL, WRONG_SUBMISSION, HINT_USED, FINAL_WRONG, TIME_BONUS, COMPLETION_BONUS, COORDINATOR_ADJUST}, `delta`, `scoreBefore`, `scoreAfter`, `ref` {challenge?, hint?, submissionId?}, `idempotencyKey` (unique), `createdAt` | Append-only; `session.score` is the cached fold |
| **FinalSubmission** | `session`, `answers`, `fields` {thief,accomplice,time,method,location: bool}, `correct`, `attemptNo`, `idempotencyKey` | |
| **LeaderboardEntry** | `event`, `participant`, `team`, `score`, `completed`, `elapsedMs`, `filesCompleted`, `rank`, `updatedAt` | Materialised from sessions; recomputed on every score/completion change |
| **AuditLog** | `actor`, `role`, `action`, `target`, `requestId`, `ip`, `metadata`, `createdAt` | Insert-only collection; no update/delete routes |

---

## 4. Database architecture

Two databases, physically separated:

**Application DB — MongoDB** (`lost_at_sql`): all entities above. Mongoose 8, transactions used where a single logical action touches more than one collection (submit = session + score txn + leaderboard; reset = many). Because a standalone `mongod` has no transactions, every multi-document write is *also* designed to be safe without them: the session document is the unit of atomicity (single-document CAS), and ScoreTransactions carry a unique idempotency key so a retried write is a no-op rather than a duplicate.

**Investigation DB — in-process SQLite (sql.js WASM)**: built from the Dataset definition at boot and on reload, held as an immutable byte image. Each query runs in a **worker thread on a fresh read-only copy** (`db = new SQL.Database(image)`), so a participant can never see another participant's effects and there is nothing to mutate anyway. Zero credentials, zero network — the strongest possible "least privilege". For ≥500 concurrent participants the worker pool size is `os.cpus()`; the image is 50 rows, so a copy costs microseconds.

Why not Postgres per-schema? It adds credentials, DDL, connection limits and network to the most sensitive component, for a 50-row dataset. The engine keeps a `SqlSandbox` interface so a `PostgresSandbox` can be added later for large datasets.

### Indexes (from access patterns only)

| Collection | Index | Serves |
|---|---|---|
| users | `{participantId:1}` unique sparse, `{coordinatorId:1}` unique sparse | login |
| investigation_sessions | `{event:1, participant:1}` unique; `{event:1, status:1}`; `{lastActivityAt:-1}` | start/resume, monitoring, watchdog |
| query_attempts | `{session:1, executedAt:-1}`; `{event:1, executedAt:-1}`; `{challenge:1}` | participant history, coordinator feed, per-challenge stats |
| score_transactions | `{session:1, createdAt:1}`; `{idempotencyKey:1}` unique | ledger, dedupe |
| final_submissions | `{session:1, attemptNo:1}` unique | ordering, dedupe |
| leaderboard_entries | `{event:1, participant:1}` unique; `{event:1, score:-1, completed:-1, elapsedMs:1}` | ranking |
| audit_logs | `{createdAt:-1}`; `{actor:1, createdAt:-1}` | review |
| idempotency_keys | `{key:1}` unique, TTL 24 h | replay protection |

Investigation DB indexes (declared in dataset definition): `access_logs(door_name, access_time)`, `access_logs(emp_id)`, `communications(emp_id)`, `communications(contact_type, message_type)`, `transactions(txn_date)`, `project_members(project_name)`.

---

## 5. API architecture

Base `/api`. Envelope: `{ success:true, data, requestId }` / `{ success:false, error:{code,message,details?}, requestId }`. Every request gets an `X-Request-Id` (echoed or generated). Mutating participant endpoints accept `Idempotency-Key` header (24 h dedupe, response replayed).

### Auth
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | `{ id, code }` → access JWT (15 min) + httpOnly refresh cookie (8 h, rotated) |
| POST | `/auth/refresh` | rotation; reuse of a consumed refresh token revokes the family |
| POST | `/auth/logout` | revokes refresh family, bumps `tokenVersion` |
| GET | `/auth/me` | |

### Participant
| Method | Path | Guards | Purpose |
|---|---|---|---|
| GET | `/events/current` | auth | state, name, durationMinutes, serverTime, remaining (event-level) |
| GET | `/investigation/briefing` | auth·participant·event≥LIVE | briefing text (un-timed) |
| POST | `/investigation/start` | auth·participant·event LIVE | create-or-resume session (idempotent) |
| GET | `/investigation/session` | auth·participant | full public session view: status, remaining, score, files/challenges status, evidence, connections, suspectStates, timeline |
| GET | `/investigation/current-file` | | shortcut |
| GET | `/investigation/progress` | | compact status map |
| GET | `/cases/:code` | file AVAILABLE/ACTIVE/COMPLETED | brief, current challenge instructions, starterSql, allowedTables, attempts, hints `[{id, used, penalty}]` (no text) |
| GET | `/cases/:code/schema` | | allowed tables: columns, types, 5 sample rows |
| POST | `/cases/:code/query` | session ACTIVE | `{ sql }` → `{ queryAttemptId, columns, rows, rowCount, truncated, durationMs, newEvidence[] }` |
| POST | `/cases/:code/hints/:hintId/use` | session ACTIVE, challenge active | idempotent; `{ text, penaltyApplied, score }` |
| POST | `/cases/:code/submit` | session ACTIVE, challenge active | `{ queryAttemptId }` or `{ sql }`, plus `{ answer }` for BOOLEAN stage → `{ correct, stage, message, score, unlocked?, evidenceAwarded[], transitions[] }` |
| GET | `/final` | files 01–05 COMPLETED | options lists only |
| POST | `/final/query` | | sandbox, no validation |
| POST | `/final/submit` | | `{ correct, fields, score, attemptNo, reveal? }` |
| GET | `/leaderboard` | auth (any role) | ranked, public fields only |
| GET | `/investigation/queries` | if `event.exposeQueryHistory` | own history |

### Coordinator (`/admin`, all `requireCoordinator`)
Event: `GET /event`, `POST /event`, `PATCH /event` (settings/scoring/leaderboard/query policy), `POST /event/{start,pause,resume,end,extend,schedule,archive}`, `POST /event/reset { mode, target? , confirm:"<event slug>" }`.
Participants/teams: `GET|POST /participants`, `PATCH /participants/:id`, `POST /participants/import`, `GET|POST /teams`, `PATCH /teams/:id`.
Content: `GET|POST /cases`, `PATCH /cases/:id`, `POST|PATCH /challenges/:id`, `POST|PATCH /hints/:id`, `GET|PATCH /evidence`, `GET|PUT /dataset`, `POST /dataset/validate`, `POST /dataset/reload`.
Monitoring: `GET /sessions`, `GET /sessions/:id` (timeline, ledger, attempts), `GET /query-attempts?session&challenge&since`, `GET /leaderboard`, `GET /stats`, `GET /audit-logs`, `POST /sessions/:id/adjust-score` (audited).
Content edits are refused while the event is LIVE unless `?force=1` (audited) — changing a validator mid-game would corrupt fairness.

### Socket.IO
Namespaces: `/participant` (room `session:<id>`), `/coordinator` (room `coordinators`). Server → participant: `session:update` (score, remaining, status), `event:state`, `timer:expired`. Server → coordinator: `PARTICIPANT_STARTED, FILE_STARTED, QUERY_EXECUTED, EVIDENCE_DISCOVERED, FILE_COMPLETED, HINT_USED, SCORE_CHANGED, FINAL_SUBMITTED, PARTICIPANT_COMPLETED, TIME_EXPIRED, CONNECTION_LOST, CONNECTION_RESTORED`. Payloads carry ids, codes and counts — never SQL results, expected sets or hint text. Clients never *send* game actions over the socket; sockets are notification-only.

---

## 6. SQL execution / security architecture

Layered — each layer independent of the others:

1. **Transport limits**: body ≤ 64 KB on `/query`; `sql.length ≤ queryPolicy.maxLength` (default 4 000); per-participant rate limit 30 queries/min (429 `QUERY_RATE_LIMITED`).
2. **Static guard** (`sqlGuard`): strip comments/strings, then require exactly **one** statement beginning with `SELECT` or `WITH`; reject on any token in the deny-list: `INSERT UPDATE DELETE DROP ALTER CREATE TRUNCATE REPLACE INTO ATTACH DETACH PRAGMA VACUUM REINDEX BEGIN COMMIT ROLLBACK SAVEPOINT` plus functions `load_extension, readfile, writefile, fts*, sqlite_*`, `sqlite_master/sqlite_schema/sqlite_temp_master`; reject `;` followed by non-whitespace. Result: `blockedReason` recorded on the QueryAttempt and audited.
3. **Sandbox**: worker thread, read-only copy of the dataset image, `PRAGMA query_only=1`, no `ATTACH`, `timeoutMs` (default 4 000) enforced by `worker.terminate()` — a runaway CTE cannot stall the pool. Results capped at `maxRows` (default 500) with `truncated:true`; cell values > 2 KB clipped.
4. **Result shaping**: column names lower-cased for validation only (display keeps original), `NULL` preserved, numbers left as numbers, `REAL` printed by the client.
5. **Isolation guarantee**: the sandbox never receives application-DB credentials, environment, or filesystem access (worker has `env: {}`; `resourceLimits: { maxOldGenerationSizeMb: 128 }`).
6. **Logging**: every execution → QueryAttempt (`sqlHash` = sha256, `resultHash` = sha256 of canonical rows) so the coordinator can spot copy-paste between participants without storing results.

Threat model covered: data modification (impossible — copy is discarded), schema discovery of app DB (different engine), DoS (timeout + pool + rate limit), injection into app queries (participant SQL never touches Mongo), answer discovery via `sqlite_master` (blocked; and the expected sets are not in the sandbox anyway — they live only in `Challenge.validationConfig`).

---

## 7. Challenge validation engine

`validate(challenge, execution, submission, sessionCtx) → { correct, reason, details }`. Route handlers never contain rules; they call `ValidationEngine.run()`.

```js
// challenge.validationStrategy + validationConfig (server-only)
{ strategy: "EXACT_SET",        config: { column: "emp_id", expected: ["E101","E102","E104","E105","E109","E112"], caseInsensitive: true } }
{ strategy: "REQUIRED_COLUMN",  config: { columns: ["emp_id"] } }                         // composable pre-check
{ strategy: "FIELD_MATCH",      config: { column: "contact_person", anyRowEquals: "E103", requireColumns: ["emp_id"] } }
{ strategy: "BOOLEAN",          config: { question: "...", expected: "no", requiresPriorResult: { strategy:"EXACT_SET", config:{…E103} } } }
{ strategy: "REQUIRED_ROWS",    config: { keyColumns: ["emp_id"], rows: [{emp_id:"E101"}], allowExtra: false } }
{ strategy: "TIME_WINDOW",      config: { column: "access_time", from: "2045-09-17 09:45:00", to: "2045-09-17 09:58:00", allRowsWithin: true } }
{ strategy: "AGGREGATE",        config: { column: "amount", op: "max", equals: 5200000 } }
{ strategy: "SQL_USES",         config: { requires: ["GROUP_BY","HAVING","AGGREGATE"], message: "…" } } // REQUIRES the construct in the SQL text; unused by Black Cipher, which only checks results
{ strategy: "ALL_OF",           config: { validators: [ … ] } }                           // composition
{ strategy: "CUSTOM_EVIDENCE",  config: { evidenceCodes: ["LAB_ENTRY_WINDOW", …] } }     // "has the session already discovered X"
```

Validators are pure functions registered in a `ValidatorRegistry` (`register(name, fn)`), unit-tested in isolation, with a shared `ResultSet` helper (column lookup case-insensitive, first result set only, values stringified + trimmed + upper-cased when `caseInsensitive`).

Mapping of the six prototype files:

| Challenge | Strategy |
|---|---|
Validation checks the **result**, never the syntax: any query that returns the right rows closes the file. Each challenge additionally carries `skills` — the constructs it was *designed* around. Those are advertised in the brief and as chips, and a correct answer written another way gets a free note naming them (`skillNote` on the submit response). To make a construct mandatory, add `SQL_USES` to the tree; Black Cipher deliberately does not.

| FILE_01 | `ALL_OF[REQUIRED_COLUMN(emp_id,name), EXACT_SET(emp_id, 6 ids)]` — skills: JOIN · difficulty easy |
| FILE_02 | `BOOLEAN(expected "no", requiresPriorResult ALL_OF[REQUIRED_COLUMN(emp_id,name), EXACT_SET(emp_id,{E103})])` — the submit carries `{ queryAttemptId, answer }`; if the prior result is wrong the response is `correct:false, reason:"PRIOR_RESULT_REQUIRED"` **with no penalty** (`attemptPolicy.penaliseWrongResult:false`), matching the prototype; skills: JOIN · difficulty medium |
| FILE_03 | `ALL_OF[REQUIRED_COLUMN, EXACT_SET(4 ids)]` — skills: subquery · difficulty medium |
| FILE_04A | `ALL_OF[REQUIRED_COLUMN, EXACT_SET({E101})]` — skills: GROUP BY + HAVING + COUNT · difficulty medium |
| FILE_04B | `FIELD_MATCH(contact_person anyRowEquals E103, requireColumns [emp_id])` |
| FILE_05 | `ALL_OF[REQUIRED_COLUMN, EXACT_SET({E101})]` — skills: GROUP BY + HAVING + SUM · difficulty medium |
| FINAL | `FINAL_DEDUCTION` → `FinalCaseValidator` (four fields — thief, accomplice, time, method — with `EQUALS` / `REGEX /^09:5[0-4]$/` rules; a blank field is refused with 400 before an attempt is spent) returning per-field booleans |

Submission flow: `submit` re-executes the referenced attempt's SQL (or the supplied SQL) inside the sandbox **on the server**, then validates. The client never sends rows. Because the dataset is immutable for the event, re-execution is deterministic; the `queryAttemptId` must belong to the same session and challenge.

---

## 8. Evidence engine

Two discovery modes, both idempotent (unique `(session, definition)`):

* **AWARD** — granted by `challenge.onSuccess.evidence[]` when the challenge is solved. Prototype mapping: FILE_01→`LAB_ENTRY_WINDOW`, FILE_02→`CCTV_DISABLED`, FILE_03→`BLACK_CIPHER_PROJECT_MEMBER`, FILE_04A→`EXTERNAL_ENCRYPTED_CONTACT`, FILE_04B→`INTERNAL_ENCRYPTED_CONTACT` + connection `E101→E103 (ENCRYPTED_INTERNAL_COMMUNICATION, 09:38–09:39:10)`, FILE_05→`FINANCIAL_MOTIVE`.
* **PASSIVE** — discovered when a *focused* query result (≤ `EVIDENCE_MAX_ROWS`=20) contains a trigger row, e.g. `LOADING_DOCK_EXIT` ← `access_logs.log_id=11`. Announced in the `/query` response as `newEvidence[]` and to coordinators as `EVIDENCE_DISCOVERED`. Never required for progression (D-9).

Evidence records: `{ definition, discoveredAt, via: {challenge|queryAttempt}, relatedEntities }`. `session.timeline` gets `EVIDENCE_DISCOVERED` entries. The final-deduction engine receives the session's evidence set (spec §15) — currently informational; `CUSTOM_EVIDENCE` allows a future event to gate the final file on evidence rather than file completion.

Suspect-state engine (same module family): applies `onSuccess.transitions[]`:

```js
// FILE_01
[{ scope:"resultSet", column:"emp_id", inSet:"SUSPECT", notInSet:"CLEARED", from:["UNKNOWN"] }]
// FILE_02
[{ entity:"E103", to:"PERSON_OF_INTEREST" }]
// FILE_03
[{ scope:"resultSet", column:"emp_id", notInSet:"CLEARED", from:["SUSPECT"] }]
// FILE_04A  (D-1)
[{ entity:"E101", to:"PRIME_SUSPECT" }, { scope:"all", from:["SUSPECT"], to:"CLEARED", except:["E101"] }]
// FILE_04B
[{ entity:"E103", to:"ACCOMPLICE" }]
```

Because FILE_01's transition uses the participant's (validated, hence exact) result set, the outcome is deterministic while keeping the prototype's "your list decides" semantics.

---

## 9. Scoring engine

`ScoringPolicy` on the Event (defaults = prototype):

```json
{ "initialScore": 1000, "wrongAnswerPenalty": 25, "hintPenalty": 50, "finalAttemptPenalty": 25,
  "timeBonus": { "enabled": false, "perMinuteRemaining": 0, "max": 0 },
  "completionBonus": 0, "minimumScore": 0 }
```

`ScoringService.apply(session, type, ref, idempotencyKey)`:
1. compute `delta` from policy (challenge/hint overrides allowed);
2. `scoreAfter = max(minimumScore, scoreBefore + delta)` (a −25 at score 10 records `delta:-10` so the ledger folds exactly);
3. insert `ScoreTransaction` (unique `idempotencyKey` = `${sessionId}:${type}:${refId}:${attemptNo}`) — duplicate key ⇒ return existing, no change;
4. CAS-update `session.score` with `version`;
5. emit `SCORE_CHANGED`; upsert LeaderboardEntry.

`INITIAL` transaction is written at session start so `Σ delta == score` always holds; a `verifyLedger(session)` job recomputes and flags drift (data-integrity check exposed to coordinators). Time/completion bonuses, when enabled, are applied once at `COMPLETED` under the same idempotency scheme.

---

## 10. Timer / session architecture

Two clocks, both server-owned:

* **Event clock** (existing): `startedAt, pausedAt, pausedTotalMs, extendedMs, durationMinutes` → `eventRemainingMs`.
* **Session clock** (new): `startedAt, expiresAt = startedAt + event.durationMinutes·60 000`. While the event is PAUSED, sessions are frozen: on resume every ACTIVE session's `expiresAt += pauseDuration` (one `updateMany`, audited). Coordinator `extend` shifts both.

`effectiveDeadline = min(session.expiresAt, eventEnd)`. Every mutating participant endpoint runs `requireActiveSession`: loads the session, computes `now ≥ effectiveDeadline` → CAS-transition to `TIME_EXPIRED` and respond `423 SESSION_EXPIRED`. A watchdog (every 5 s) expires idle sessions so coordinators see `TIME_EXPIRED` even when the participant is away. Responses include `serverTime` and `remainingMs`; the client renders a countdown from `remainingMs − (Date.now() − receivedAt)` and re-syncs on every response and on `session:update` — client clock skew is irrelevant.

Resume: `POST /investigation/start` is idempotent — if a session exists it is returned unchanged (`resumed:true`). Refresh, second tab, reconnect all converge on the same document. Multiple tabs are allowed (read-only race safety is handled by CAS + idempotency, §12). Starting after `COMPLETED`/`TIME_EXPIRED` returns that session's terminal view; it never creates a new one.

---

## 11. Coordinator architecture

* **Separation**: `/admin` router mounted first with `requireCoordinator`; participant routers never expose admin models; JWT `role` claim + DB re-check (`tokenVersion`, `isActive`) per request.
* **Event control**: state transitions as CAS operations; `pause` freezes session clocks; `end` expires all ACTIVE sessions; `extend` shifts deadlines; `schedule` sets `startsAt` (watchdog auto-starts).
* **Content configuration**: cases, challenges, hints, evidence, dataset all CRUD-able; validation on write (`validationStrategy` must be registered; expected values must be resolvable; dataset PKs must be unique; a dry-run executes every challenge's `starterSql` and, if `referenceSql` is provided, asserts the validator accepts it). Locked while LIVE unless forced.
* **Monitoring**: `GET /sessions` (status, file, score, remaining, lastActivity, connected), live socket feed, query stream with `sqlHash`/`resultHash` collision hints, per-file completion funnel, hint usage, SQL error rate, expired count.
* **Reset workflow** (`POST /event/reset`): `mode ∈ {RESET_EVENT, RESET_PARTICIPANT, RESET_TEAM, RESET_LEADERBOARD, RESET_INVESTIGATION_DATA}`, body must repeat the event slug as `confirm`. Each mode is a documented list of collections it touches; runs in a transaction where available; writes one AuditLog with counts. `RESET_EVENT` = sessions, attempts, ledgers, submissions, leaderboard removed; event → DRAFT; content and users retained.
* **Audit**: every admin mutation and every participant milestone → AuditLog (`actor, role, action, target, requestId, ip, metadata`). Collection is insert-only at the model layer (`pre('deleteOne'|'updateOne')` throws).

---

## 12. Concurrency & anti-cheating strategy

| Scenario | Mechanism |
|---|---|
| Same participant, two tabs submit at once | Session `version` CAS: second writer gets `409 STALE_SESSION`, re-reads, sees challenge COMPLETED, returns the stored success (idempotent) |
| Double-click / retry on submit, hint, final | `Idempotency-Key` (client generates UUID per click; 24 h store) **and** natural keys: `(session, challenge, attemptNo)`, `(session, hint)` unique, ScoreTransaction `idempotencyKey` unique |
| Two SQL requests at once | Independent — read-only copies; per-session concurrency cap 2 (`429 TOO_MANY_QUERIES`) to protect the pool |
| Coordinator pauses/ends during a query | Query completes (harmless, read-only); the *next* mutating call sees the new event state. Submit re-checks the event state *inside* the CAS write |
| Timer expires during a submit | `requireActiveSession` evaluated at the start **and** the CAS condition includes `status:"ACTIVE", expiresAt:{$gt: now}` — a late write cannot land |
| Event ends during final submission | same CAS condition on session + event state re-read; result `423 EVENT_ENDED` |
| Client-side manipulation | Nothing client-side is authoritative; all views are derived from `GET /investigation/session` |
| Answer discovery | Expected sets, hint text, success narrative, transitions, reveal are ⚿ fields stripped by explicit serializers (`toParticipantView`), never `toJSON` defaults; tests assert their absence |
| Brute-forcing final fields (D-4) | penalty per attempt, `finalAttemptPolicy.maxAttempts` (optional), audit + coordinator alert after N attempts |
| SQL copy between participants | `sqlHash`/`resultHash` visible to coordinators; not auto-penalised |
| Token theft/replay | short access JWT, rotating refresh with family revocation, `tokenVersion` bump on logout/reset |

---

## 13. Failure / recovery strategy

| Failure | Behaviour |
|---|---|
| Mongo unavailable at boot | process exits non-zero (supervisor restarts); health `/api/health` reports `db:"down"` |
| Mongo drops mid-run | Mongoose auto-reconnect; requests fail fast with `503 DB_UNAVAILABLE`; sockets keep connections; no in-memory truth to lose |
| SQL timeout | worker terminated, `QueryAttempt{success:false,errorType:"TIMEOUT"}`, `408 QUERY_TIMEOUT`; pool replaces the worker |
| Malicious SQL | rejected at guard (`400 SQL_FORBIDDEN`), attempt recorded with `blockedReason`, audited; repeated (≥5/min) → coordinator alert |
| Participant disconnect / refresh / new device | `POST /investigation/start` resumes; `GET /investigation/session` restores UI |
| WebSocket disconnect | REST is authoritative; socket emits `CONNECTION_LOST/RESTORED` to coordinators; client polls `/session` every 30 s as fallback |
| Expired access token | `401 TOKEN_EXPIRED` → client refreshes silently; refresh failure → login |
| Expired / completed session | `423 SESSION_EXPIRED` / `409 SESSION_COMPLETED` with the terminal view |
| Duplicate request | idempotency replay (same `requestId` echoed with `replayed:true`) |
| Invalid progression (locked file, wrong stage) | `403 FILE_LOCKED`, `409 CHALLENGE_NOT_ACTIVE` |
| Coordinator reset while participant active | session deleted → participant's next call gets `404 SESSION_NOT_FOUND`; client returns to briefing; `session:reset` socket event |
| Server restart | All state persisted; on boot: rebuild sandbox image from Dataset, resume watchdog (expires overdue sessions, auto-starts SCHEDULED events), recompute leaderboard, `verifyLedger` sample |
| Dataset reload fails | previous image kept; `500 DATASET_INVALID` with validation report |
| Leaderboard drift | recomputable from sessions at any time (`POST /admin/leaderboard/rebuild`) |

Structured logs (pino-style JSON): `requestId, userId, role, eventId, sessionId, route, status, durationMs, errorCode, sqlDurationMs`; never SQL text at info level, never tokens/codes. Metrics endpoint `/api/admin/stats`: active sessions, queries/min, SQL failure %, avg query ms, file completion funnel, hints used, final submissions, expired sessions, socket connections.

---

## 14. Testing strategy

Runner: `node --test` (already in place), Mongo via `mongodb-memory-server` for integration, sandbox tests use the real sql.js worker.

| Layer | Tests |
|---|---|
| **Unit — validators** | each strategy: exact/superset/subset/empty/case/duplicate rows; column missing; BOOLEAN with wrong prior; FIELD_MATCH any-row; TIME_WINDOW; AGGREGATE; ALL_OF short-circuit; FinalCaseValidator field matrix (time regex edges 09:49/09:50/09:54/09:55, location "Loading Dock B"/"loading dock"/"dock") |
| **Unit — sqlGuard** | every denied keyword incl. inside CTE/subquery; comments/strings smuggling; multi-statement; PRAGMA; sqlite_master; allowed: JOIN/GROUP BY/CTE/window/CASE/REPLACE() |
| **Unit — scoring** | ledger fold, floor clamp delta, idempotent replay, policy overrides |
| **Unit — suspect-state** | each transition rule, illegal transition rejected, timeline append |
| **Unit — timer** | remaining/expiry, pause shifting, extend |
| **Golden dataset** | rebuild sandbox from the Black Cipher definition and assert every challenge's `referenceSql` validates true and FILE_05 starter validates false |
| **Integration — auth/authz** | login, refresh rotation + reuse detection, logout, participant hitting `/admin` → 403, coordinator hitting participant mutations → 403 |
| **Integration — lifecycle** | DRAFT→…→ENDED, start-after-ended refused, CAS double-start, pause shifts `expiresAt` |
| **Integration — session** | start creates once; start twice resumes; restart-resume; expiry mid-flow; complete then start returns terminal |
| **Integration — progression** | full happy path FILE 01→FINAL with exact prototype queries; locked file 403; completed challenge re-submit idempotent; FILE 02 wrong result no penalty; FILE 04 A→B; FILE 05 starter fails then narrowed passes |
| **Integration — hints** | −50 once, second call free, hint on inactive challenge 409, text absent from `GET /cases/:code` |
| **Integration — evidence** | award once, passive `LOADING_DOCK_EXIT` on log 11, no duplicate |
| **Integration — final** | per-field feedback, −25, completion, leaderboard row, reveal only on success |
| **Concurrency** | `Promise.all` of 10 identical submits → one COMPLETED transition, one ScoreTransaction; 10 hint calls → one charge; submit racing expiry |
| **Security** | leak scan: serialize every participant response and assert no `expected`, `validationConfig`, `hint.text`, `reveal`, `answerKey`; SQL modification attempts leave the image unchanged (checksum) |
| **Recovery** | kill/restart server mid-session (in-process app re-create) and resume with identical state; ledger verification |

---

## 15. Dataset comparison & decision

| Criterion | Prototype dataset (E101–E112) | Current Zinnia dataset (Tanaka / TEMPORAL_CORE) |
|---|---|---|
| Tables / rows | 6 / 50 | 10 / 392 |
| Matches prototype workflow, wording, expected sets | **Exactly** | No (different case, names, answers) |
| Beginner suitability (college students, 60 min) | High — single-table filters, one join at most | Medium — more tables, more noise rows |
| Validation cost per submit | negligible | negligible |
| Passive-evidence richness | 1 (Loading Dock) | 48 tokens, 21 connections |
| Effort to adopt under this spec | zero data work | rewrite of every challenge/expected set — and forbidden by "do not invent case data" |

**Decision: the prototype dataset is the canonical `black-cipher` dataset.** It is smaller, faster, beginner-appropriate, and it is the only one the prototype's validators are defined against. The engine is dataset-agnostic: the current larger dataset is retained in the repo as a second `Dataset` document (`temporal-core`, marked *experimental*) that a future event can pair with its own case files — it costs nothing to keep and demonstrates the engine's reuse.

---

## 16. Implementation plan

What exists in `server/` is retained where it already meets the spec (auth + tokenVersion, helmet/cors/rate-limit, zod validation, sql.js worker + guard, event clock, audit log, dataset import with rollback, Socket.IO rooms, materialised leaderboard). What changes:

| Area | Change |
|---|---|
| `models/` | add `InvestigationSession` (replaces `InvestigationProgress`), `Challenge`, `Hint`, `ScoreTransaction`, `FinalSubmission`, `IdempotencyKey`, `Dataset`, `RefreshToken`; `Event` gains `state` (7 states), `scoringPolicy`, `leaderboardPolicy`, `queryScope`, `queryPolicy`; `CaseFile` loses `questions`, gains `challenges[]`, `isFinal` |
| `engine/` (new) | `ValidatorRegistry` + validators, `ResultSet`, `EvidenceEngine`, `SuspectStateEngine`, `ScoringService`, `SessionService` (start/resume/expire/CAS), `ProgressionService` (unlock rules), `FinalCaseValidator`, `IdempotencyStore` |
| `services/` | `challengeService` (query/hint/submit orchestration), `eventService` (state machine), `resetService` (modes), `leaderboardService` (policy-driven), `monitorService` (stats) |
| `routes/` | new participant routes (§5), `/admin` extended; explicit `toParticipantView` serializers |
| `middleware/` | `requireActiveSession`, `idempotency`, `requestId`, refresh-token cookie handling |
| `data/` | `datasets/black-cipher.js` (prototype tables verbatim), `cases/black-cipher.js` (six files, challenges, hints, evidence, transitions, reveal — prototype wording verbatim), `datasets/temporal-core.js` (kept) |
| `tests/` | per §14 |
| `client/` | keep design; rewire the investigation pages to the new API: case-file screen (brief → schema chips → editor → results → Submit Findings / Yes-No / Part A→B), evidence-board sidebar with the 12 suspects and state badges, final-deduction form (5 fields), landing/briefing copy switched to Black Cipher data |

Order of work: models + engine + tests (data integrity, security) → routes + serializers + leak tests (security, correctness) → seed content from prototype + golden tests (game logic) → sockets/monitoring/reset (coordinator) → client rewiring → README/deployment notes.

---

## 17. Implementation notes (what shipped)

Everything in §§1–14 is implemented under `server/src/` with the following deliberate deviations, each chosen with the priority order in mind:

| Area | Doc said | Shipped | Why |
|---|---|---|---|
| Score ledger | separate `ScoreTransaction` collection with unique `idempotencyKey` | `session.ledger[]` **embedded** in `InvestigationSession`, keyed per session | A standalone `mongod` (the target deployment) has no multi-document transactions. Embedding makes "state change + score change" one atomic document write; `verifyLedger` and `GET /admin/sessions-ledger-check` prove Σ delta == score. |
| Final submissions | `FinalSubmission` collection | `session.finalSubmissions[]` embedded | same reason; volume is tiny |
| Atomic transitions | CAS on `{ _id, version }` | Mongoose optimistic concurrency (`__v`) — every `save()` is a compare-and-swap, retried up to 4× on `VersionError`; bulk clock shifts bump `__v` so in-flight writers retry | idiomatic, same guarantee |
| Non-penalised verdicts | listed as "attempt, no penalty" | **not recorded as attempts** (missing `emp_id`, FILE 02 gate closed, answer missing) | matches the prototype, which showed a message instead of a Submit button |
| D-1, D-2, D-9 | see decision log | prototype-exact defaults (reviewer instruction) | no invented gameplay |
| Hint entities | `Hint` collection | embedded in `Challenge.hints[]` (with `_id`, `select:false` text); `PATCH /admin/hints/:hintId` addresses them by id | atomic content edits |
| Passive evidence | trigger by `access_logs.log_id` | generic `{ table, column, value }` trigger on `EvidenceDefinition` (unused by Black Cipher) | engine feature, not a Black Cipher rule |
| Refresh tokens | cookie | httpOnly cookie **and** body fallback (`refreshToken`) so the SPA works through the Vite proxy and on hosts that strip cookies | practicality |

Verified locally without dependencies: 29 unit tests (validators, engine core, SQL guard, **golden content** — every reference query validates, FILE 05's starter is rejected, the replayed suspect board equals the prototype's). The integration suite (`server/tests/integration/`) boots the real API against MongoDB and walks the entire event; it skips itself when MongoDB or `node_modules` are absent.
