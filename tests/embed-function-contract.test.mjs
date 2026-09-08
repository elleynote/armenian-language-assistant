import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const indexUrl = new URL('../supabase/functions/embed-knowledge/index.ts', import.meta.url)

async function readSource() {
  try {
    return await readFile(indexUrl, 'utf8')
  } catch (error) {
    assert.fail(`embed-knowledge Edge Function is required: ${error.message}`)
  }
}

test('embedding helper requires a private admin secret', async () => {
  const source = await readSource()
  assert.match(source, /KNOWLEDGE_ADMIN_SECRET/)
  assert.match(source, /x-admin-secret/i)
})

test('embedding helper only embeds approved trusted knowledge', async () => {
  const source = await readSource()
  assert.match(source, /is_approved/)
  assert.match(source, /chatbot_knowledge/)
})

test('embedding helper uses multilingual OpenAI embeddings at 512 dimensions', async () => {
  const source = await readSource()
  assert.match(source, /text-embedding-3-small/)
  assert.match(source, /dimensions:\s*512/)
  assert.match(source, /OPENAI_API_KEY/)
})
