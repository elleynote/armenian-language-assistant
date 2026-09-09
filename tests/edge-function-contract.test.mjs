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
  const lexicalIndex = source.indexOf('await searchLexical(')
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

test('system prompt enforces school transliteration rules', () => {
  const eLetter = '\u0565'
  const esWord = '\u0565\u057d'
  const emWord = '\u0565\u0574'
  const oLetter = '\u0578'

  assert.ok(source.includes(`${eLetter} is transliterated as 'ye' when it is at the beginning of a word and 'e' when it is in the middle or end of a word.`))
  assert.ok(source.includes(`${esWord} is transliterated as 'yes' when it is at the beginning of a sentence, and 'es' when it is in the middle or end of a sentence.`))
  assert.ok(source.includes(`${emWord} is always transliterated as 'em'.`))
  assert.ok(source.includes(`${oLetter} is transliterated as 'vo' when it is at the beginning of a word and 'o' when it is in the middle or end of a word.`))
})

test('system prompt distinguishes vo from o-letter transliteration', () => {
  const voLetter = '\u0578'
  const oLetter = '\u0585'

  assert.ok(source.includes(`The Armenian letters ${voLetter} and ${oLetter} are distinct. Never apply the ${voLetter} -> 'vo' rule to a word that begins with ${oLetter}.`))
})

test('chat function treats selected Armenian variety as an explicit request contract', () => {
  assert.match(source, /payload\.language/)
  assert.match(source, /language:\s*payload\.language/)
})

test('trusted retrieval is filtered by selected Armenian variety before answer selection', () => {
  assert.match(source, /filterKnowledgeByLanguage/)
  assert.match(source, /filterKnowledgeByLanguage\(.*payload\.language/s)
})

test('Eastern mode is prohibited from consuming Western trusted context', () => {
  assert.match(source, /Eastern Armenian \(hye\)/)
  assert.match(source, /never use Western Armenian trusted knowledge/i)
})

test('Western translation answers receive deterministic server-side transliteration', () => {
  assert.match(source, /transliterateWesternArmenian/)
  assert.match(source, /appendTranslationTransliteration/)
})

test('assistant recommends Tun tools only and never competitors', () => {
  assert.match(source, /Tun Translator/)
  assert.match(source, /Role Play/)
  assert.match(source, /Word Breakdown/)
  assert.match(source, /Flashcards/)
  assert.match(source, /Daily Practice/)
  assert.match(source, /Thesaurus/)
  assert.match(source, /Never recommend competitor/i)
})
