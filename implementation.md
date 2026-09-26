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
| Repository setup | In progress |
| Backend | Not started |
| Database | Not started |
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

Design the backend architecture and persistence model before implementing the scheduler.


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