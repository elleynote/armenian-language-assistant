import test from 'node:test'
import assert from 'node:assert/strict'
import {
  chooseAnswerMode,
  extractOutputText,
  formatKnowledgeContext,
  getAllowedCorsOrigin,
  hashClientIdentity,
  normalizeSearchText,
  parseAllowedOrigins,
  resolveSupabaseSecretKey,
  validateChatPayload,
} from '../supabase/functions/armenian-chat/logic.js'

test('validateChatPayload accepts a trimmed learner question', () => {
  assert.deepEqual(
    validateChatPayload({
      message: '  How do I say hello in Western Armenian?  ',
      clientId: '4c9a9024-85c9-4a39-bc69-4b1a9ab96fd1',
      sessionId: null,
    }),
    {
      message: 'How do I say hello in Western Armenian?',
      clientId: '4c9a9024-85c9-4a39-bc69-4b1a9ab96fd1',
      sessionId: null,
    },
  )
})

test('validateChatPayload rejects empty messages', () => {
  assert.throws(
    () => validateChatPayload({ message: '   ', clientId: 'client-12345678' }),
    /message is required/i,
  )
})

test('validateChatPayload rejects oversized messages', () => {
  assert.throws(
    () => validateChatPayload({ message: 'a'.repeat(2001), clientId: 'client-12345678' }),
    /2000 characters/i,
  )
})

test('validateChatPayload rejects missing client ids', () => {
  assert.throws(
    () => validateChatPayload({ message: 'hello' }),
    /clientId is required/i,
  )
})

test('chooseAnswerMode returns database for a strong lexical match', () => {
  assert.deepEqual(
    chooseAnswerMode({ lexical: [{ score: 0.96, id: 'k1' }], semantic: [] }),
    { mode: 'database', match: { score: 0.96, id: 'k1' } },
  )
})

test('chooseAnswerMode returns database for a strong semantic match', () => {
  assert.deepEqual(
    chooseAnswerMode({ lexical: [], semantic: [{ similarity: 0.9, id: 'k2' }] }),
    { mode: 'database', match: { similarity: 0.9, id: 'k2' } },
  )
})

test('chooseAnswerMode returns context when semantic matches are useful but not direct', () => {
  assert.deepEqual(
    chooseAnswerMode({
      lexical: [],
      semantic: [
        { similarity: 0.78, id: 'k2' },
        { similarity: 0.72, id: 'k3' },
      ],
    }),
    {
      mode: 'ai_with_context',
      matches: [
        { similarity: 0.78, id: 'k2' },
        { similarity: 0.72, id: 'k3' },
      ],
    },
  )
})

test('chooseAnswerMode falls back when no approved match is useful', () => {
  assert.deepEqual(
    chooseAnswerMode({ lexical: [], semantic: [{ similarity: 0.4, id: 'k4' }] }),
    { mode: 'ai_fallback', matches: [] },
  )
})

test('extractOutputText reads Responses API output_text and trims it', () => {
  assert.equal(extractOutputText({ output_text: '  Բարեւ  ' }), 'Բարեւ')
})

test('extractOutputText can reconstruct text from output items', () => {
  assert.equal(
    extractOutputText({
      output: [
        {
          type: 'message',
          content: [
            { type: 'output_text', text: 'First sentence. ' },
            { type: 'output_text', text: 'Second sentence.' },
          ],
        },
      ],
    }),
    'First sentence. Second sentence.',
  )
})

test('getAllowedCorsOrigin returns exact configured origin', () => {
  assert.equal(
    getAllowedCorsOrigin('https://school.example.com', [
      'https://school.example.com',
      'https://www.school.example.com',
    ]),
    'https://school.example.com',
  )
})

test('getAllowedCorsOrigin rejects an unconfigured origin', () => {
  assert.equal(
    getAllowedCorsOrigin('https://evil.example', ['https://school.example.com']),
    null,
  )
})

test('validateChatPayload rejects a malformed session id', () => {
  assert.throws(
    () => validateChatPayload({ message: 'hello', clientId: 'client-12345678', sessionId: 'not-a-uuid' }),
    /sessionId is invalid/i,
  )
})

test('parseAllowedOrigins splits and trims a comma-separated setting', () => {
  assert.deepEqual(
    parseAllowedOrigins('https://school.example.com, https://www.school.example.com ,'),
    ['https://school.example.com', 'https://www.school.example.com'],
  )
})

test('resolveSupabaseSecretKey prefers the new named secret key map', () => {
  assert.equal(
    resolveSupabaseSecretKey({
      secretKeysJson: '{"default":"sb_secret_current"}',
      legacyServiceRoleKey: 'legacy-key',
    }),
    'sb_secret_current',
  )
})

test('resolveSupabaseSecretKey falls back to the legacy service role key', () => {
  assert.equal(
    resolveSupabaseSecretKey({ secretKeysJson: '', legacyServiceRoleKey: 'legacy-key' }),
    'legacy-key',
  )
})

test('hashClientIdentity is deterministic without storing raw identifiers', async () => {
  const first = await hashClientIdentity({
    clientId: 'client-12345678',
    ip: '203.0.113.10',
    salt: 'server-only-salt',
  })
  const second = await hashClientIdentity({
    clientId: 'client-12345678',
    ip: '203.0.113.10',
    salt: 'server-only-salt',
  })
  assert.equal(first, second)
  assert.match(first, /^[a-f0-9]{64}$/)
  assert.notEqual(first, 'client-12345678')
})

test('formatKnowledgeContext deduplicates matches and labels trusted material', () => {
  const context = formatKnowledgeContext([
    { id: 'k1', question: 'How do I say hello?', answer: 'Բարեւ', source: 'lesson 1' },
    { id: 'k1', question: 'How do I say hello?', answer: 'Բարեւ', source: 'lesson 1' },
    { id: 'k2', question: 'How do I say thank you?', answer: 'Շնորհակալութիւն', source: null },
  ])
  assert.match(context, /TRUSTED KNOWLEDGE 1/)
  assert.match(context, /Բարեւ/)
  assert.match(context, /Շնորհակալութիւն/)
  assert.equal((context.match(/How do I say hello\?/g) ?? []).length, 1)
})

test('normalizeSearchText makes repeat-question keys stable', () => {
  assert.equal(normalizeSearchText('  Hello,   WORLD!  '), 'hello world')
})

test('resolveSupabaseSecretKey supports the modern single secret key used by local CLI', () => {
  assert.equal(
    resolveSupabaseSecretKey({ singleSecretKey: ' sb_secret_local ' }),
    'sb_secret_local',
  )
})
