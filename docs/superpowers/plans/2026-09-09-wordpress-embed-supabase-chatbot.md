# WordPress Embed + Supabase Armenian Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a repository-ready Western Armenian assistant with a self-contained WordPress embed, Supabase database-first retrieval, semantic fallback, and controlled OpenAI generation.

**Architecture:** WordPress contains only generated HTML/CSS/JavaScript. A public Supabase Edge Function validates and rate-limits anonymous requests, searches approved Postgres knowledge lexically first, performs semantic retrieval only on misses, then uses OpenAI only for grounded explanation or fallback. Protected Supabase tables and all secrets remain server-side.

**Tech Stack:** WordPress Custom HTML/Elementor HTML widget, vanilla JavaScript/CSS, Supabase Postgres + pgvector + pg_trgm, Supabase Edge Functions (Deno/TypeScript), OpenAI Responses API and Embeddings API, Node 22 built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-09-armenian-language-school-chatbot-design.md`

## Global Constraints
- No custom WordPress plugin.
- No separate public frontend website.
- No secrets in browser code.
- Lexical database search runs before any OpenAI request.
- Only approved database rows can be returned or used as trusted context.
- AI-generated answers are never automatically trusted.
- Default chat model is configurable and initially `gpt-5.6-luna`.
- Default embedding model is `text-embedding-3-small` with 512 dimensions.
- Production CORS must be restricted to configured WordPress origins.

---

### Task 1: Repository harness and pure policy tests

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `tests/chat-policy.test.mjs`
- Create: `supabase/functions/armenian-chat/logic.js`

**Interfaces:**
- Produces `validateChatPayload(body)`, `chooseAnswerMode(matches)`, `extractOutputText(response)`, `getAllowedCorsOrigin(origin, allowedOrigins)`.

- [ ] Write Node tests for invalid/valid payloads, direct DB vs context vs fallback decision thresholds, OpenAI response extraction, and CORS origin selection.
- [ ] Run `npm test` and confirm RED because `logic.js` does not exist.
- [ ] Implement the minimal pure functions in `logic.js`.
- [ ] Run `npm test` and confirm GREEN.
- [ ] Commit the task.

### Task 2: Supabase schema and retrieval RPCs

**Files:**
- Create: `supabase/migrations/202609090001_armenian_chatbot.sql`
- Create: `tests/sql-schema.test.mjs`

**Interfaces:**
- Produces tables `chatbot_knowledge`, `chatbot_question_aliases`, `chatbot_sessions`, `chatbot_messages`, `chatbot_ai_answers`, `chatbot_rate_limits`.
- Produces RPCs `search_chatbot_knowledge_lexical`, `match_chatbot_knowledge`, and `consume_chatbot_rate_limit`.

- [ ] Write static contract tests asserting required extensions, tables, RLS statements, triggers, RPC names, vector dimension 512, and approved-only filters.
- [ ] Run `npm test` and confirm RED because the migration is absent.
- [ ] Implement one idempotent migration with indexes, normalization triggers, RLS, lexical search, vector search, and atomic rate limiting.
- [ ] Run `npm test` and confirm GREEN.
- [ ] Commit the task.

### Task 3: Edge Function database-first orchestration

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/functions/armenian-chat/index.ts`
- Extend: `tests/chat-policy.test.mjs`

**Interfaces:**
- Consumes the Task 1 policy helpers and Task 2 RPCs.
- Produces POST JSON response `{ answer, source, sessionId }`.

- [ ] Add tests for configuration parsing helpers, hashed client key stability, and context formatting.
- [ ] Run tests RED.
- [ ] Implement CORS, secret-key lookup, request validation, server-side client hashing, rate limiting, session creation/reuse, lexical RPC search, semantic retrieval after lexical miss, OpenAI Responses call, message logging, and AI-answer review logging.
- [ ] Run tests GREEN and run TypeScript static syntax checks available locally.
- [ ] Commit the task.

### Task 4: Knowledge embedding helper

**Files:**
- Create: `supabase/functions/embed-knowledge/index.ts`
- Create: `supabase/functions/embed-knowledge/logic.js`
- Create: `tests/embed-knowledge.test.mjs`

**Interfaces:**
- Produces protected POST `{ knowledgeId }` handler that embeds one approved knowledge row with the configured OpenAI embedding model and 512 dimensions.

- [ ] Write tests for validation and embedding response parsing.
- [ ] Run tests RED.
- [ ] Implement helper logic and protected Edge Function guarded by `KNOWLEDGE_ADMIN_SECRET`.
- [ ] Run tests GREEN.
- [ ] Commit the task.

### Task 5: WordPress frontend and generated embed

**Files:**
- Create: `frontend/core.mjs`
- Create: `frontend/app.js`
- Create: `frontend/styles.css`
- Create: `frontend/template.html`
- Create: `scripts/build-embed.mjs`
- Create: `tests/frontend.test.mjs`
- Generate: `embed/wordpress-embed.html`

**Interfaces:**
- Produces a self-contained WordPress block with `window.TunArmenianAssistantConfig.apiUrl` as the only deployment-specific required value.

- [ ] Write tests for payload shaping, local-storage keys, HTML escaping, and Armenian keyboard insertion at cursor.
- [ ] Run tests RED.
- [ ] Implement tested frontend helpers, accessible chat UI, keyboard, network handling, and scoped styling.
- [ ] Implement deterministic embed builder that inlines frontend CSS/JS.
- [ ] Run `npm run build:embed` and tests GREEN.
- [ ] Commit the task.

### Task 6: Beginner setup documentation and verification

**Files:**
- Create: `.env.example`
- Create: `README.md`
- Create: `docs/setup.md`
- Create: `docs/knowledge-import.csv`

**Interfaces:**
- Documents exact VS Code/GitHub/Supabase/WordPress steps and secret names.

- [ ] Add setup documentation covering project creation/linking, migration deployment, secrets, functions, WordPress embed, CORS, and first knowledge row.
- [ ] Add a safe CSV import template with headers and one illustrative Western Armenian example.
- [ ] Verify repository contains no real secrets, project IDs, or API keys.
- [ ] Run full `npm test` and `npm run build:embed`.
- [ ] Create a distributable ZIP excluding `.git` and local secrets.
- [ ] Commit documentation and generated artifact sources.
