# Beginner Setup Guide — WordPress + Supabase

This guide starts from the project ZIP in VS Code and ends with the assistant running on a separate page of your existing WordPress website.

## 1. What you need

- VS Code
- Node.js 22 or newer
- A GitHub account/repository for this project
- A Supabase project
- An OpenAI API key
- Administrator/editor access to the WordPress website
- Elementor HTML widget or a WordPress Custom HTML block that permits scripts

You do **not** need a separate frontend host such as Netlify for this setup.

## 2. Open and verify the project in VS Code

Extract the ZIP, open the folder in VS Code, and open **Terminal > New Terminal**.

Run:

```bash
node --version
npm test
npm run build:embed
```

The tests should pass and the build should regenerate:

```text
embed/wordpress-embed.html
```

## 3. Put the project in a dedicated GitHub repository

Create an empty GitHub repository named something like:

```text
armenian-language-assistant
```

Do not place this code inside an unrelated project.

If the extracted ZIP is not already a Git repository, run:

```bash
git init
git add .
git commit -m "Initial Western Armenian assistant"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/armenian-language-assistant.git
git push -u origin main
```

If you already cloned the empty GitHub repository before copying these files, just commit and push normally.

## 4. Install the Supabase CLI for this project

Supabase currently recommends installing the CLI as a project dev dependency when using npm:

```bash
npm install supabase --save-dev
```

Then use it through `npx`:

```bash
npx supabase --help
```

The CLI requires Node.js 20 or newer; this project already targets Node.js 22+.

## 5. Create the Supabase project

In the Supabase dashboard, create a new project dedicated to this assistant, unless you have intentionally decided to reuse a suitable existing Armenian project.

Keep the project reference shown in the dashboard. It looks similar to:

```text
abcdefghijklmno
```

Do not paste database passwords or secret API keys into WordPress.

## 6. Log in and link VS Code to Supabase

From the project folder:

```bash
npx supabase login
npx supabase projects list
npx supabase link --project-ref YOUR_PROJECT_REF
```

Replace `YOUR_PROJECT_REF` with the real project reference.

This repository already contains `supabase/config.toml`, migrations, and Edge Functions, so do not run a fresh scaffold command over the existing `supabase/` folder.

## 7. Preview and apply the database migration

First preview the remote change:

```bash
npx supabase db push --dry-run
```

If the preview points to the correct project, apply it:

```bash
npx supabase db push
```

This creates:

- `chatbot_knowledge`
- `chatbot_question_aliases`
- `chatbot_sessions`
- `chatbot_messages`
- `chatbot_ai_answers`
- `chatbot_rate_limits`
- pgvector and trigram search support
- database-first retrieval functions
- RLS protection

Do not run destructive commands such as `db reset --linked` against a production project.

## 8. Create production secrets

Copy `.env.example` to a local file named `.env.production`.

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.production
```

Generate two different random values:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use one value for `CHATBOT_HASH_SALT` and the other for `KNOWLEDGE_ADMIN_SECRET`.

Edit `.env.production` so it contains your real values:

```env
OPENAI_API_KEY=YOUR_REAL_OPENAI_KEY
OPENAI_CHAT_MODEL=gpt-5.6-luna
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_REASONING_EFFORT=none
ALLOWED_ORIGINS=https://www.your-wordpress-domain.com
CHATBOT_HASH_SALT=YOUR_FIRST_RANDOM_VALUE
KNOWLEDGE_ADMIN_SECRET=YOUR_SECOND_RANDOM_VALUE
CHATBOT_RATE_LIMIT_MAX=20
CHATBOT_RATE_LIMIT_WINDOW_SECONDS=600
```

`ALLOWED_ORIGINS` must be an origin, not a page URL. Correct:

```text
https://www.example.com
```

Incorrect:

```text
https://www.example.com/armenian-assistant/
```

If both `https://example.com` and `https://www.example.com` genuinely serve the page, separate them with a comma:

```env
ALLOWED_ORIGINS=https://example.com,https://www.example.com
```

The `.gitignore` already blocks `.env.production` from Git.

Supabase automatically provides the server-side project URL and modern secret-key environment variables to hosted Edge Functions, so those Supabase server keys should not be copied into this file or WordPress.

## 9. Upload the secrets to Supabase

Run:

```bash
npx supabase secrets set --env-file .env.production
npx supabase secrets list
```

Supabase makes updated function secrets available without requiring another deploy.

## 10. Deploy the two Edge Functions

Docker is not required for production deployment. Use API-based deployment explicitly:

```bash
npx supabase functions deploy armenian-chat --use-api
npx supabase functions deploy embed-knowledge --use-api
```

Your public chat endpoint will be:

```text
https://YOUR_PROJECT_REF.supabase.co/functions/v1/armenian-chat
```

The `embed-knowledge` function is a maintenance endpoint protected by `KNOWLEDGE_ADMIN_SECRET`. Never call it from WordPress browser code.

## 11. Add the first trusted knowledge

The simplest beginner workflow is Supabase **Table Editor > chatbot_knowledge**.

You can also import `docs/knowledge-import.csv`.

Important fields:

- `question`: learner-style question
- `answer`: trusted Western Armenian answer/explanation
- `category`: for organization
- `language`: normally `Western Armenian`
- `source`: where the answer came from
- `is_approved`: must be `true` before the assistant can use it

The database trigger creates `normalized_question` automatically. Do not manually fill that field.

### Add question variations

For a trusted knowledge row, you can add alternate learner phrasings to `chatbot_question_aliases` and point each alias to the same `knowledge_id`.

Example:

```text
Knowledge question: How do I say hello in Western Armenian?
Alias 1: What's hello in Western Armenian?
Alias 2: How do you say hello in Armenian?
```

This improves database-only matching without using AI.

## 12. Add semantic embeddings to approved knowledge

Lexical matching works immediately, even without embeddings. Embeddings improve matching when a learner asks the same idea using different wording.

After creating and approving a knowledge row, copy its UUID from `chatbot_knowledge.id`.

Then call the private maintenance function. On Windows PowerShell, `curl.exe` can be used:

```powershell
curl.exe -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/embed-knowledge" `
  -H "Content-Type: application/json" `
  -H "x-admin-secret: YOUR_KNOWLEDGE_ADMIN_SECRET" `
  -d '{"knowledgeId":"YOUR_KNOWLEDGE_ROW_UUID"}'
```

A successful response looks like:

```json
{"ok":true,"knowledgeId":"...","dimensions":512}
```

Do this for approved rows that should participate in semantic matching. For a large future knowledge import, this can later be automated as a batch/admin workflow without changing the WordPress frontend.

## 13. Test the live chat endpoint before WordPress

You can test from a terminal without a browser origin header:

```powershell
curl.exe -X POST "https://YOUR_PROJECT_REF.supabase.co/functions/v1/armenian-chat" `
  -H "Content-Type: application/json" `
  -d '{"message":"How do I say hello in Western Armenian?","clientId":"manual-test-12345"}'
```

If your approved knowledge contains the starter hello question, the response should include:

```json
"source":"database"
```

That confirms the database answered directly without needing an AI-generated answer.

## 14. Configure the WordPress embed

Open:

```text
embed/wordpress-embed.html
```

Near the bottom, find:

```javascript
apiUrl: 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/armenian-chat'
```

Replace **only** `YOUR_PROJECT_REF` with the real Supabase project reference.

Example:

```javascript
apiUrl: 'https://abcdefghijklmno.supabase.co/functions/v1/armenian-chat'
```

Do not add an OpenAI key, Supabase secret key, service-role key, database password, or `KNOWLEDGE_ADMIN_SECRET` to this file.

## 15. Create the separate page in WordPress

In WordPress:

1. Go to **Pages > Add New**.
2. Name it something like **Armenian Language Assistant**.
3. Keep your normal site header/footer or use your normal full-width page template.
4. Edit the page with Elementor if that is what the existing school site uses.
5. Add **one HTML widget** where the assistant should appear.
6. Paste the **entire contents** of `embed/wordpress-embed.html` into that one widget.
7. Preview the page before publishing.
8. Publish it at a URL such as `/armenian-language-assistant/`.

The code is intentionally scoped under `#tun-armenian-assistant` so its CSS should not redesign the rest of the WordPress page.

If a WordPress security plugin strips `<script>` tags, use an administrator account with permission to add unfiltered HTML or configure that security tool to allow this trusted page block. Do not move server secrets into WordPress as a workaround.

## 16. Confirm browser CORS

Open the published WordPress page and send a question.

If the browser says the origin is not allowed:

1. Check the exact site origin in the browser address bar.
2. Update `ALLOWED_ORIGINS` in `.env.production`.
3. Run:

```bash
npx supabase secrets set --env-file .env.production
```

No function redeploy is needed just for secret changes.

## 17. How the hybrid answer flow works

For every learner question:

1. The WordPress embed calls only `armenian-chat`.
2. The Edge Function hashes the anonymous browser identifier plus request IP and applies the database rate limit.
3. It searches **approved database knowledge lexically first**.
4. A high-confidence lexical match returns directly. No OpenAI request is made.
5. If lexical search is not strong enough, the backend creates a question embedding and searches approved knowledge semantically.
6. A high-confidence semantic result can still return the trusted database answer directly.
7. Medium-confidence trusted matches are given to the AI as context.
8. If there is no useful database knowledge, the controlled Western Armenian AI fallback answers.
9. AI-generated answers are saved in `chatbot_ai_answers` as `pending` for later review.

## 18. Review AI fallback questions and grow the database

In Supabase Table Editor, open `chatbot_ai_answers`.

Useful fields:

- `question`
- `answer`
- `times_asked`
- `status`
- `context_ids`

Prioritize questions with a high `times_asked` value. Review the Armenian answer carefully before trusting it.

When an answer is approved by the school:

1. Create a new row in `chatbot_knowledge` using the reviewed question and corrected answer.
2. Set `is_approved = true`.
3. Optionally add aliases in `chatbot_question_aliases`.
4. Run the private `embed-knowledge` call for the new row.
5. Change the review row's status to `approved` for your records.

The system intentionally does **not** auto-promote an AI answer into trusted knowledge.

## 19. Updating the WordPress design later

Edit:

- `frontend/styles.css` for appearance
- `frontend/template.html` for markup/copy
- `frontend/app.js` for browser behavior
- `frontend/core.mjs` for tested pure helpers

Then run:

```bash
npm run build:embed
npm test
```

Copy the regenerated `embed/wordpress-embed.html` into the same WordPress HTML widget.

## 20. Troubleshooting checklist

### The Send button says setup is required

`YOUR_PROJECT_REF` is still present in the embed file.

### WordPress shows the UI but requests fail with 403

The real WordPress origin is missing from `ALLOWED_ORIGINS`.

### The function returns 500

Check **Supabase > Edge Functions > Logs** and confirm:

- `OPENAI_API_KEY` exists
- `CHATBOT_HASH_SALT` exists
- the database migration was applied
- the function has access to Supabase's auto-provisioned server secret key environment

### Every question uses AI

Confirm:

- trusted rows have `is_approved = true`
- the questions/aliases are populated correctly
- semantic rows have embeddings if you expect semantic retrieval

### A database answer is wrong

Correct or unapprove the row in `chatbot_knowledge`. Approved database content is intentionally treated as authoritative.

### Too many 429 responses

The defaults allow 20 requests per 10-minute window per hashed client identity. Adjust `CHATBOT_RATE_LIMIT_MAX` and `CHATBOT_RATE_LIMIT_WINDOW_SECONDS` carefully if the school needs a different policy.

## 21. Recommended first launch sequence

Before public launch:

1. Add 25–50 high-confidence common Western Armenian Q&A entries.
2. Add common aliases for those questions.
3. Embed the important approved rows.
4. Test exact questions, paraphrases, Armenian-script input, and unrelated questions.
5. Review `chatbot_messages` and `chatbot_ai_answers` after internal testing.
6. Only then publish the WordPress page to students.

This gives the hybrid system useful trusted coverage from day one instead of starting as an AI-only chatbot with an empty database.
