# Implementation Journal

## Project

ReachInbox Email Scheduler

## Objective

Build a production-grade email scheduling system supporting:

- Email scheduling
- Persistent delayed jobs
- Multiple senders
- Configurable concurrency
- Distributed rate limiting
- Minimum delay between sends
- Idempotent email processing
- Ethereal SMTP delivery
- Elasticsearch search
- Slack notifications
- Google OAuth
- React/Next.js dashboard

## Development Approach

The project will be implemented incrementally.

For each significant engineering problem:

1. Identify the requirement
2. Investigate possible approaches
3. Compare trade-offs
4. Select an approach
5. Implement
6. Test
7. Document the result
8. Commit the change

## Current Status

| Area | Status |
|---|---|
| Repository setup | Done |
| Backend | In Progress |
| Database | Done |
| Docker infrastructure | Not started |
| Scheduling API | Not started |
| Transactional outbox | Not started |
| Redis / BullMQ | Not started |
| Email worker | Not started |
| Rate limiting | Not started |
| Elasticsearch | Not started |
| Slack | Not started |
| Google OAuth | Not started |
| Frontend | Not started |
| Testing | Not started |
| Documentation | Not started |

## Engineering Log

### 26 September 2026

#### Repository Setup

- Created private GitHub repository.
- Connected local repository to GitHub remote.
- Verified GitHub connectivity using `git ls-remote`.
- Added initial project structure.
- Added Node.js `.gitignore`.
- Created initial implementation journal.

#### Next Step

Implement Issue #3 — Docker Compose development environment (PostgreSQL, Redis, Elasticsearch).


## Architecture

The system uses PostgreSQL as the source of truth, Redis/BullMQ for
persistent job scheduling and distributed coordination, and Elasticsearch
for search.

![System Architecture](docs/architecture/architecture.png)

### Core Architecture Decisions

1. PostgreSQL is the source of truth for application and email state.
2. Email records and outbox events are committed atomically in one transaction.
3. The Outbox Dispatcher bridges PostgreSQL and BullMQ reliably.
4. Redis/BullMQ provides persistent delayed jobs, retries, and queue coordination.
5. Rate limiting is distributed using Redis rather than in-memory state.
6. Worker processing uses idempotency checks to reduce duplicate sends.
7. Elasticsearch is used as a search/read optimization layer, not as the primary database.
8. Slack and Google OAuth integrations remain outside the critical email-processing path.

### Reliability Strategy

The transactional outbox pattern prevents a scheduled email from being
persisted in PostgreSQL without a corresponding scheduling event.

The dispatcher can safely retry pending outbox events after a process crash.
BullMQ provides persistent delayed jobs and retries, while the worker checks
email state before processing to avoid duplicate processing.

### Architecture Status

- Architecture diagram completed
- Core components identified
- Transactional outbox selected
- PostgreSQL selected as source of truth
- Redis/BullMQ selected for job scheduling
- Elasticsearch selected for search

## Engineering Log

### 2026-09-26 — Architecture Design

**Problem:**  
Define a production-grade architecture for persistent email scheduling,
reliable background processing, distributed rate limiting, and restart recovery.

**Investigation:**  
Evaluated the database, queue, and background-processing requirements,
with particular focus on reliable scheduling, persistence across restarts,
and consistency between application state and queued jobs.

**Decision:**  
Selected PostgreSQL + transactional outbox + Redis/BullMQ.

**Reasoning:**  
PostgreSQL remains the source of truth for application and email state.
The transactional outbox ensures that an email record and its scheduling
event are committed atomically. Redis/BullMQ provides persistent delayed
jobs, retries, concurrency control, and distributed coordination.

**Result:**  
Completed the system architecture diagram and documented the major
reliability, persistence, and infrastructure decisions.

### 2026-09-26 — PostgreSQL Schema (Issue #2)

**Problem:**  
Persist authenticated users, senders, campaigns, individual emails, and
outbox events so scheduling can survive restarts and stay consistent
before BullMQ is introduced.

**Investigation:**  
Evaluated what state the system needs to own durably in PostgreSQL before
any queue technology is introduced. The critical insight is that PostgreSQL
must be the source of truth for every email and every scheduling event, so
that a process crash between "insert email" and "enqueue BullMQ job" does
not silently lose work. This drove the transactional outbox model where
email records and outbox events are committed in one transaction.

Evaluated ORM options. Prisma was selected over raw SQL and Knex because
it provides a TypeScript-first schema definition, auto-generated typed
client, and a versioned migration system — all of which reduce bugs and
are straightforward to explain and audit.

**Decision:**  
PostgreSQL is the source of truth. Prisma provides the TypeScript schema,
migrations, and generated client. Application rows and outbox events are
written in one transaction; the dispatcher enqueues BullMQ jobs only after
that commit.

**Why these five models exist:**
- `User` — owns senders and campaigns after Google OAuth authentication.
- `Sender` — a from-address identity per user. No SMTP passwords stored here.
- `Campaign` — one scheduling batch from the dashboard (subject, body, start
  time, delay between sends, hourly cap).
- `Email` — one recipient/delivery record. Each recipient is its own row with
  independent `scheduledAt`, status, attempt count, and error tracking.
- `OutboxEvent` — the durable bridge from PostgreSQL to the future BullMQ
  queue. Written in the same transaction as the email record.

**Why emails are individual records:**  
Each recipient needs independent `scheduledAt`, status, `attemptCount`, and
`lastError`. A worker can claim and update a single row atomically. If the
batch were a single record, one failure would block all recipients. The
`sequence` field preserves intended send order.

**Why outbox events are stored in PostgreSQL:**  
If a process crashes after inserting emails but before enqueueing BullMQ
jobs, the pending `EMAIL_SCHEDULED` outbox rows survive in PostgreSQL.
Restart recovery is polling those rows and re-enqueueing — not
reconstructing lost state from Redis.

**Enums:**

| Enum | Values |
|---|---|
| `CampaignStatus` | `SCHEDULED`, `PROCESSING`, `COMPLETED`, `CANCELLED`, `FAILED` |
| `EmailStatus` | `SCHEDULED`, `PROCESSING`, `SENT`, `FAILED`, `CANCELLED` |
| `OutboxEventType` | `EMAIL_SCHEDULED` |
| `OutboxStatus` | `PENDING`, `PROCESSING`, `PROCESSED`, `FAILED` |

`CampaignStatus` uses `COMPLETED` (not `DONE`) to signal that all emails
in the batch have been processed. `PROCESSING` signals the dispatcher is
actively working. `FAILED`/`CANCELLED` are terminal states.

**Indexes and constraints:**

| Index | Table | Purpose |
|---|---|---|
| `UNIQUE email` | `users` | One account per email address |
| `UNIQUE googleSubject` | `users` | One Google identity per user |
| `UNIQUE (userId, email)` | `senders` | No duplicate from-addresses per user |
| `UNIQUE (emailId, eventType)` | `outbox_events` | At most one `EMAIL_SCHEDULED` per email |
| `(status, scheduledAt)` | `emails` | Worker lookup: find due emails efficiently |
| `(status, availableAt)` | `outbox_events` | Dispatcher polling: find pending events |
| `(status, startAt)` | `campaigns` | Campaign scheduling queries |
| `campaignId`, `senderId`, `recipient` | `emails` | Lookup and filter indexes |
| `userId`, `senderId` | `campaigns` | Ownership and sender filter indexes |
| `userId` | `senders` | Ownership filter |

**Cascade / restrict rules:**
- Deleting a `User` cascades to their `Sender` and `Campaign` records.
- Deleting a `Campaign` cascades to its `Email` records.
- Deleting an `Email` cascades to its `OutboxEvent` records.
- `Sender` FK on `Campaign` and `Email` uses `RESTRICT` — a sender cannot
  be deleted while live emails reference it, preventing orphaned send-from
  addresses.

**Implementation — files created:**

| File | Purpose |
|---|---|
| `backend/prisma/schema.prisma` | Prisma schema: datasource, enums, five models |
| `backend/prisma/migrations/20260926143000_init_email_scheduler/migration.sql` | Generated DDL for all tables, indexes, and constraints |
| `backend/prisma/migrations/migration_lock.toml` | Locks provider to PostgreSQL |
| `backend/src/db/prisma.ts` | Global `PrismaClient` singleton (prevents multiple connections in dev) |
| `backend/package.json` | `prisma:validate`, `prisma:generate`, `prisma:migrate`, `prisma:migrate:deploy`, `typecheck` scripts |
| `backend/tsconfig.json` | TypeScript config: ES2022, Node16 module resolution, strict mode |
| `backend/.env.example` | `DATABASE_URL` placeholder — safe to commit |

**Verification — commands run and results:**

```
npm run prisma:validate
→ The schema at prisma/schema.prisma is valid 🚀  (exit 0)

npm run prisma:generate
→ Generated Prisma Client (v6.19.3)  (exit 0)

npm run typecheck
→ No TypeScript errors  (exit 0)

npx prisma migrate deploy
→ Applying migration 20260926143000_init_email_scheduler
→ All migrations have been successfully applied.  (exit 0)

psql \dt  →  6 tables present (5 domain + _prisma_migrations)
psql \di  →  19 indexes confirmed in live database
```

PostgreSQL was run via a temporary Docker container (`postgres:16-alpine`)
matching the credentials in `backend/.env` while a permanent Docker Compose
environment is implemented in Issue #3.

**Acceptance criteria:**

- [x] PostgreSQL schema implemented
- [x] Prisma configured
- [x] Migration created (`20260926143000_init_email_scheduler`)
- [x] Foreign keys added
- [x] Unique constraints added
- [x] Required indexes added
- [x] Email/outbox relationship implemented
- [x] Schema validated (`prisma validate` passes)
- [x] Database documentation added (this entry)
- [x] Verification completed (`migrate deploy`, `\dt`, `\di`, `tsc`)

**Tradeoffs / limitations:**
- `dbgenerated("gen_random_uuid()")` delegates UUID creation to PostgreSQL
  so IDs are assigned inside the database transaction — safer than
  application-generated UUIDs in a multi-process environment.
- `OutboxEvent` has no `updatedAt` field intentionally. The outbox is
  append-oriented; only `processedAt` and `lastError` are mutable, which
  are tracked explicitly.
- SMTP credentials are deliberately absent from the `Sender` model.
  Connection secrets will be managed via environment variables in a future
  issue, keeping the database free of plaintext secrets.

**Result:**  
Initial Prisma schema and migration live under `backend/prisma`. The
migration was applied to a live PostgreSQL instance and all 19 indexes were
confirmed present. Prisma was selected for type-safe database access and
versioned PostgreSQL migrations. Issue #2 is complete.