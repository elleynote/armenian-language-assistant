# Western Armenian Language Assistant

A database-first Western Armenian assistant designed to be embedded directly into a dedicated page on an existing WordPress website.

## What this repository contains

- A self-contained WordPress/Elementor embed in `embed/wordpress-embed.html`
- A Supabase Postgres schema with protected chatbot tables, lexical retrieval, pgvector semantic retrieval, chat logging, and rate limiting
- A public `armenian-chat` Supabase Edge Function that keeps all privileged keys server-side
- A protected `embed-knowledge` Edge Function for adding semantic embeddings to approved knowledge rows
- A built-in Armenian Unicode keyboard
- Automated Node tests for the decision policy, SQL contracts, Edge Function contracts, and frontend helpers

## Architecture

```text
WordPress dedicated page
        |
        | POST { message, clientId, sessionId? }
        v
Supabase Edge Function: armenian-chat
        |
        +--> 1. approved lexical DB search
        |       |
        |       +--> strong match -> return database answer (no OpenAI call)
        |
        +--> 2. semantic DB search after lexical miss
        |       |
        |       +--> strong match -> return database answer
        |       +--> useful context -> AI answers using trusted DB context
        |
        +--> 3. no useful DB knowledge -> controlled AI fallback
                |
                +--> save AI answer as pending review, never auto-trust it
```

The browser never receives an OpenAI key or a Supabase secret/service-role key.

## Quick start

The full beginner-friendly deployment walkthrough is in [`docs/setup.md`](docs/setup.md).

1. Open the project in VS Code.
2. Run `npm test`.
3. Create/link a Supabase project.
4. Apply `supabase/migrations/202609090001_armenian_chatbot.sql` with the Supabase CLI.
5. Configure the secrets listed in `.env.example`.
6. Deploy both Edge Functions.
7. Add approved knowledge to `chatbot_knowledge`.
8. Replace `YOUR_PROJECT_REF` in `embed/wordpress-embed.html`.
9. Paste the complete embed into an Elementor HTML widget on a dedicated WordPress page.

## Useful commands

```bash
npm test
npm run build:embed
npm run check
```

`npm run build:embed` regenerates `embed/wordpress-embed.html` from the files in `frontend/`.

## Knowledge policy

Only `chatbot_knowledge.is_approved = true` rows can be used as authoritative database answers or trusted AI context. AI fallback output is written to `chatbot_ai_answers` with `status = 'pending'`; it is not automatically copied into the trusted knowledge base.

## Default AI configuration

- Chat model: `gpt-5.6-luna` (configurable with `OPENAI_CHAT_MODEL`)
- Embeddings: `text-embedding-3-small`, 512 dimensions
- Semantic embeddings are requested only after the lexical database stage does not have a strong direct answer.

## Important security notes

- Do not put `OPENAI_API_KEY`, `SUPABASE_SECRET_KEYS`, `SUPABASE_SECRET_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` in WordPress.
- Set `ALLOWED_ORIGINS` to the exact WordPress origin(s). The function has no wildcard CORS default.
- Keep `KNOWLEDGE_ADMIN_SECRET` private. It protects the maintenance-only embedding endpoint.
- RLS is enabled on every chatbot table and browser roles are not granted direct table access.

## Project layout

```text
armenian-language-assistant/
├── embed/
│   └── wordpress-embed.html
├── frontend/
│   ├── app.js
│   ├── core.mjs
│   ├── styles.css
│   └── template.html
├── scripts/
│   └── build-embed.mjs
├── supabase/
│   ├── config.toml
│   ├── functions/
│   │   ├── armenian-chat/
│   │   └── embed-knowledge/
│   └── migrations/
├── tests/
├── docs/
│   ├── knowledge-import.csv
│   └── setup.md
├── .env.example
└── package.json
```

## Current deployment scope

This repository does not create another public website and does not require a custom WordPress plugin. The public UI lives on a normal page in the existing Online Armenian School WordPress website. The Supabase backend remains reusable if the school later decides to place the same assistant in another product.
