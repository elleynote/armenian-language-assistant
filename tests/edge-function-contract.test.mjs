import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const indexUrl = new URL('../supabase/functions/armenian-chat/index.ts', import.meta.url)
const configUrl = new URL('../supabase/config.toml', import.meta.url)
const source = await readFile(indexUrl, 'utf8')
const config = await readFile(configUrl, 'utf8')

test('public chat function disables JWT verification explicitly', () => {
  assert.match(config, /\[functions\.armenian-chat\][\s\S]*verify_jwt\s*=\s*false/i)
})

test('chat request path searches lexical database before requesting an embedding', () => {
  const lexicalIndex = source.indexOf('const lexicalMatches = await searchLexical')
  const embeddingIndex = source.indexOf('const embedding = await createEmbedding')
  assert.ok(lexicalIndex >= 0, 'runtime lexical search is required')
  assert.ok(embeddingIndex >= 0, 'runtime embedding fallback is required')
  assert.ok(lexicalIndex < embeddingIndex, 'runtime lexical search must occur before embedding fallback')
})

test('chat function uses protected server-side Supabase credentials', () => {
  assert.match(source, /SUPABASE_SECRET_KEYS/)
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.doesNotMatch(source, /SUPABASE_ANON_KEY/)
})

test('chat function calls OpenAI only from the Edge Function', () => {
  assert.match(source, /https:\/\/api\.openai\.com\/v1\/responses/)
  assert.match(source, /OPENAI_API_KEY/)
  assert.match(source, /OPENAI_CHAT_MODEL/)
})

test('chat function logs answer provenance and pending AI review rows', () => {
  assert.match(source, /chatbot_messages/)
  assert.match(source, /chatbot_ai_answers/)
  assert.match(source, /ai_with_context/)
  assert.match(source, /ai_fallback/)
})

test('production chat function does not default CORS to wildcard', () => {
  assert.doesNotMatch(source, /Deno\.env\.get\('ALLOWED_ORIGINS'\)\s*\|\|\s*['"]\*['"]/)
})
