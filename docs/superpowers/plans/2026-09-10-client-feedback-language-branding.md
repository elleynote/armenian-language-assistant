# Client Feedback: Language, Branding, Transliteration, and Tun Recommendations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply Elley's chatbot feedback except header/footer: Tun branding, full-viewport chat, Western/Eastern mode, automatic transliteration for translations, translator-aligned Western rules, and Tun-only recommendations.

**Architecture:** Keep the existing DB-first assistant architecture. Add a `language` (`hyw` or `hye`) request field and isolate retrieval by variety. Western mode continues using trusted knowledge and exact Tun transliteration rules; Eastern mode never consumes Western trusted knowledge and uses controlled Eastern AI fallback until Eastern trusted entries exist. Frontend mode switches reset conversation state to prevent cross-variety context mixing.

**Tech Stack:** Vanilla HTML/CSS/JS WordPress embed, Node tests, Supabase Edge Functions, PostgreSQL RPCs, OpenAI Responses/Embeddings APIs.

**Spec:** Client feedback from 2026-09-09 plus TunApp source styling and Western-Armenian-Translator behavior.

## Global Constraints

- Do not change or recreate the Tun header or footer.
- Use Tun styling: Nunito, #DB182B primary red, dark headings, gray body text, white/light surfaces.
- Remove chatbot top padding completely.
- Chat panel fills `100vh`/`100dvh`; messages flex to fill remaining height and scroll internally.
- Default language is Western Armenian (`hyw`). Supported varieties are `hyw` and `hye` only.
- Switching variety resets the current chat session.
- Western and Eastern knowledge retrieval must not mix.
- Translation into Western Armenian must include transliteration every time.
- Western transliteration must follow Tun's translator rules, not model-invented romanization.
- Armenian letters `ո` and `օ` remain distinct; `ո` uses initial `vo`, while `օ` does not.
- Trusted knowledge remains the primary grammar/spelling authority.
- Recommend any relevant Tun tool; never recommend competitor Armenian-learning/translation resources.
- Preserve existing auth, rate limiting, logging, embedding dimensions, database schema, and public/private function boundaries unless a migration is required solely for language-safe retrieval.

---

### Task 1: Add failing regression coverage

**Files:**
- Modify: `tests/frontend.test.mjs`
- Modify: `tests/chat-policy.test.mjs`
- Modify: `tests/edge-function-contract.test.mjs`

**Interfaces:**
- Consumes: existing frontend template/core/app and `armenian-chat` Edge Function source.
- Produces: regression contracts for language payloads, Tun styling/full viewport, translation/transliteration policy, knowledge isolation, and Tun-only recommendations.

- [ ] Add frontend tests requiring `language` in chat payload, Western/Eastern selector, zero top padding, `100dvh` layout, Nunito, and Tun red.
- [ ] Run focused frontend tests and confirm RED.
- [ ] Add backend/policy tests requiring `hyw|hye` validation, language-aware retrieval, Western automatic translation transliteration, and Tun-only recommendations.
- [ ] Run focused backend tests and confirm RED.

### Task 2: Implement language-aware frontend and viewport/Tun styling

**Files:**
- Modify: `frontend/core.mjs`
- Modify: `frontend/app.js`
- Modify: `frontend/template.html`
- Modify: `frontend/styles.css`
- Regenerate: `embed/wordpress-embed.html`

**Interfaces:**
- Produces: `buildChatPayload({ message, clientId, sessionId, language })`; UI mode selector with `hyw`/`hye`; language-aware title/intro/placeholder; session reset on mode change.

- [ ] Implement minimal payload language support.
- [ ] Add Western/Eastern toggle and reset behavior.
- [ ] Replace fixed chat heights with a `100dvh` flex shell and internal message scrolling.
- [ ] Apply Nunito/#DB182B Tun theme and remove top padding.
- [ ] Regenerate WordPress embed using the repository's existing build script.
- [ ] Run frontend tests and confirm GREEN.

### Task 3: Implement deterministic Western transliteration helper

**Files:**
- Create: `supabase/functions/armenian-chat/transliteration.js`
- Modify: `tests/chat-policy.test.mjs`

**Interfaces:**
- Produces: `transliterateWesternArmenian(value: string): string`, aligned to the Tun translator implementation.

- [ ] Add direct transliteration tests for `ես`, `եմ`, initial/middle `ե`, initial/middle `ո`, distinct `օ`, Western consonant values, `ու`, `եւ/և`.
- [ ] Run tests and confirm RED.
- [ ] Implement deterministic helper from the trusted translator project behavior.
- [ ] Run tests and confirm GREEN.

### Task 4: Make backend language-safe and translation-aware

**Files:**
- Modify: `supabase/functions/armenian-chat/logic.js`
- Modify: `supabase/functions/armenian-chat/index.ts`
- Modify only if necessary: current chatbot SQL migration/RPC definitions.

**Interfaces:**
- `validateChatPayload()` returns `{ message, clientId, sessionId, language }` where language is `hyw|hye` and defaults to `hyw`.
- Search functions receive/return only matches compatible with active variety.
- AI system prompt receives explicit active variety.

- [ ] Validate `language` and default legacy clients to `hyw`.
- [ ] Ensure lexical/semantic trusted matches are filtered to the selected variety before answer-mode selection.
- [ ] In `hye`, never provide Western trusted context to the model.
- [ ] Strengthen Western grammar/transliteration instructions using the translator project rules.
- [ ] Require translations into Western Armenian to include Armenian script plus deterministic transliteration.
- [ ] Keep ordinary grammar/vocabulary answers concise and do not force transliteration unless the response is translating content.
- [ ] Run backend policy/contract tests and confirm GREEN.

### Task 5: Add Tun-only recommendation policy

**Files:**
- Modify: `supabase/functions/armenian-chat/index.ts`
- Modify: `tests/chat-policy.test.mjs`

**Interfaces:**
- Produces: an allowlist-style recommendation policy covering all relevant Tun tools without competitor promotion.

- [ ] Add failing tests for Tun-only recommendations.
- [ ] Add system instructions allowing relevant Tun tools such as Translator, Role Play, Word Breakdown, Flashcards, Daily Practice, Thesaurus, and other Tun tools while prohibiting competitor resources.
- [ ] Run tests and confirm GREEN.

### Task 6: Verify and prepare deployment

**Files:**
- No additional production files expected.

**Interfaces:**
- Produces: verified branch ready to merge/deploy.

- [ ] Run full `npm test` and record pass/fail counts.
- [ ] Run any repository build/embed verification scripts required by `package.json`.
- [ ] Review diff to confirm header/footer are untouched.
- [ ] Confirm no secret values were introduced.
- [ ] Report the exact Supabase deploy command required for `armenian-chat` after merge and the updated WordPress embed file that must be pasted into the page if the site is not auto-consuming repository frontend assets.
