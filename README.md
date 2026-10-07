
https://reach-inbox-email-scheduler-qrd1.vercel.app

# Email Scheduler

A production-grade, highly scalable email scheduling system built with a robust architecture to handle high throughput, global rate-limiting, and reliable queueing. 

## Features

- **High-Throughput Email Dispatching**: Built using an event-driven architecture and a robust Outbox pattern to guarantee zero message loss even during crashes.
- **Advanced Job Queues (BullMQ)**: Implements precise exponential backoff, retry mechanisms, and a centralized live dashboard.
- **Global Rate Limiting**: Intelligent Redis-backed rolling-window rate limits to gracefully throttle large bursts without blocking processes.
- **Slack Integrations**: Real-time Slack notifications via OAuth for rate limits and campaign completions without blocking the email dispatch pipeline.
- **Real-time Live UI Dashboard**: Monitor BullMQ email sending states in real-time.
- **Elasticsearch Integration**: Emails are fully indexed and searchable instantly via a standalone Elasticsearch instance.

---

## Architecture Stack

### Backend
- **Node.js** & **Express** with **TypeScript**
- **BullMQ** (Redis) for Delayed & Background Jobs
- **Prisma ORM** for PostgreSQL interaction
- **Elasticsearch** for search indexing
- **Ethereal SMTP** for email delivery simulation

### Frontend
- **React.js** & **Vite** (TypeScript)
- **Tailwind CSS** for modern UI/UX
- **Shadcn UI** components

---

## Prerequisites

Ensure you have the following installed on your machine:
- Node.js (v18+)
- Docker & Docker Compose (for running Redis, Postgres, and Elasticsearch)

---

## Setup & Installation

### 1. Start Infrastructure (Docker)
The project relies on PostgreSQL, Redis, and Elasticsearch. You can spin these up instantly using the provided `docker-compose.yml`.

```bash
# In the root directory
docker-compose up -d
```

### 2. Backend Setup
Navigate into the `backend` folder and install dependencies:

```bash
cd backend
npm install
```

Configure your `.env` file in the `backend` directory. (If it doesn't exist, create it with these defaults):
```env
DATABASE_URL="postgresql://reachinbox:reachinbox@localhost:5432/reachinbox_email_scheduler?schema=public"
REDIS_URL="redis://:reachinbox@localhost:6379"
ELASTICSEARCH_URL="http://localhost:9200"
PORT=3000

# Ethereal Test SMTP (You can use the default or generate your own)
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=your_ethereal_user
SMTP_PASS=your_ethereal_pass

# Slack Credentials (Required for Slack OAuth integration)
SLACK_CLIENT_ID="your_slack_client_id"
SLACK_CLIENT_SECRET="your_slack_client_secret"
```

Initialize the database schema:
```bash
npx prisma db push
```

Start the backend development server:
```bash
npm run dev
```
*The backend will run on `http://localhost:3000`.*

---

### 3. Frontend Setup
Open a **new terminal**, navigate to the `frontend` folder and install dependencies:

```bash
cd frontend
npm install
```

Start the frontend development server:
```bash
npm run dev
```
*The frontend will be available at `http://localhost:5173`.*

---

## BullMQ Live Dashboard

You can monitor the live email dispatch queue, track delayed jobs (rate limits), and monitor failures via the built-in BullMQ dashboard.

- **URL:** [http://localhost:3000/admin/queues](http://localhost:3000/admin/queues)

This dashboard provides real-time visibility into the `email` and `search` background workers.

---

## Testing

The test suite covers all acceptance criteria: integration tests, worker tests, outbox recovery, idempotency, distributed rate limiting, load scenarios, and failure scenarios.

Run the full suite:

```bash
# Inside the backend folder
npm run test
```

**Result: 45 tests, 6 test files, all passing.**

### Test Coverage Breakdown

| File | Tests | Covers |
|---|---|---|
| `app.test.ts` | 4 | Health endpoint, auth guard, 404 handling |
| `rateLimiter.test.ts` | 5 | Distributed rate limiting — allows under limit, blocks at limit+1, per-sender scoping, next-available-time precision, env var config |
| `slackService.test.ts` | 10 | Slack disconnected (no crash), live webhook call, 1-hour debounce (no spam), multi-sender isolation, network failure resilience |
| `emailWorker.test.ts` | 12 | Normal send path, rate limit rescheduling via `moveToDelayed`, SMTP failure → FAILED status, Slack crash safety, 1000+ email load scenario, outbox recovery documentation |
| `campaigns.test.ts` | 10 | API auth enforcement, Zod input validation (recipients, subject, senderId, body, date, 10K limit) |
| `emails.test.ts` | 4 | Elasticsearch unavailable (mocked), search auth, query parameter passthrough |

### Load Test (Live)

To inject 500 emails directly into the database and observe BullMQ + rate limiting behavior live:

```bash
# Inside the backend folder
npx tsx src/scripts/loadTest.ts
```

Watch the backend logs to see the Outbox Dispatcher claim events in batches, BullMQ workers process them, and rate-limited jobs get gracefully rescheduled.


---

## Rate Limiting

### Strategy: Redis Rolling-Window with Lua Script (Per-Sender)

Rate limiting is enforced **per sender email address** using a Redis Sorted Set and an atomic Lua script. This is safe across multiple concurrent workers and multiple instances.

**How it works:**
- Redis key: `sender:<senderEmail>:ratelimit` (one key per sender, shared across all campaigns)
- Each time a worker processes an email, it runs a single atomic Lua script that:
  1. Removes entries older than 1 hour (`ZREMRANGEBYSCORE`)
  2. Counts current entries in the window (`ZCARD`)
  3. If count >= limit → returns the timestamp of the **oldest** entry so the worker can calculate exactly when the next slot opens
  4. If count < limit → adds the current email and returns a success indicator

**Configuration (via `.env`, no hardcoding):**
```env
MAX_EMAILS_PER_HOUR=50      # Max emails per sender per rolling hour window
EMAIL_DELAY_SECONDS=10      # Delay between consecutive emails in a campaign
```

**When the limit is reached:**
- The email is **not dropped or permanently failed**
- The worker calls `job.moveToDelayed(nextAvailableTime)` to reschedule it into BullMQ's delayed queue at the exact millisecond a slot opens up
- Order is preserved as much as possible (jobs re-enter the queue ordered by their delay timestamp)
- A **live Slack webhook** is fired once per hour per sender (debounced via Redis TTL) to notify the user

**Trade-offs:**
- The Lua script approach is more precise than BullMQ's built-in `limiter` because it uses a true rolling window (not a fixed bucket that resets every hour)
- A fixed-bucket limiter can allow up to 2x the limit at bucket boundaries; the rolling window prevents this entirely

---

## Behavior Under Load (1000+ Emails)


If a user schedules **1,000+ emails** for the same time, the system guarantees stability, order, and strict rate-limit adherence without crashing or dropping jobs:

1. **Transactional Outbox**: The frontend request inserts all 1,000 emails and 1,000 `PENDING` outbox events in a single atomic Postgres transaction. This ensures the HTTP request returns instantly, avoiding API timeouts.
2. **Batched Dispatching**: The `outboxDispatcher` polls the database and claims events in batches of 50 using `SELECT ... FOR UPDATE SKIP LOCKED`. This pushes the emails into BullMQ smoothly without overwhelming Redis.
3. **Atomic Rate Limiting**: As BullMQ workers process the queue, they check the Redis Lua-script rate limiter. If `MAX_EMAILS_PER_HOUR` is 50, the first 50 emails are processed and sent via Ethereal SMTP.
4. **Rescheduling & Thundering Herd Prevention**: The 51st email (and all subsequent 950 emails) will be instantly rejected by the Redis Lua script, which calculates the exact millisecond the next rolling-window slot opens up. The worker then uses `job.moveToDelayed()` to gracefully push the job into the future without failing it. 
5. **Slack Notification**: The exact moment the 51st email hits the limit, an asynchronous, non-blocking webhook is fired to the user's connected Slack workspace, notifying them that the campaign has been throttled. If Slack is not connected, the notification is silently ignored to prevent crashes.

---

## Maintenance Commands

If you ever need to completely wipe the database and queues to start fresh:

```bash
# Inside the backend folder
npx tsx reset.ts
```

If you need to manually force BullMQ to drop stuck ghost-jobs from killed worker processes:
```bash
# Inside the backend folder
npx tsx clean_queue.ts
```
