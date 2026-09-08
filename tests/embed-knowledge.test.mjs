import test from 'node:test'
import assert from 'node:assert/strict'

const logicUrl = new URL('../supabase/functions/embed-knowledge/logic.js', import.meta.url)

async function loadLogic() {
  try {
    return await import(`${logicUrl.href}?v=${Date.now()}`)
  } catch (error) {
    assert.fail(`embed-knowledge logic module is required: ${error.message}`)
  }
}

test('validateEmbedRequest accepts a UUID knowledge id', async () => {
  const { validateEmbedRequest } = await loadLogic()
  const result = validateEmbedRequest({ knowledgeId: '123e4567-e89b-12d3-a456-426614174000' })
  assert.deepEqual(result, { knowledgeId: '123e4567-e89b-12d3-a456-426614174000' })
})

test('validateEmbedRequest rejects malformed knowledge ids', async () => {
  const { validateEmbedRequest } = await loadLogic()
  assert.throws(() => validateEmbedRequest({ knowledgeId: 'not-a-uuid' }), /knowledgeId/i)
})

test('extractEmbedding verifies vector dimensions', async () => {
  const { extractEmbedding } = await loadLogic()
  const vector = Array.from({ length: 512 }, (_, index) => index / 512)
  assert.deepEqual(extractEmbedding({ data: [{ embedding: vector }] }, 512), vector)
  assert.throws(
    () => extractEmbedding({ data: [{ embedding: [0.1, 0.2] }] }, 512),
    /512 dimensions/i,
  )
})

test('buildKnowledgeEmbeddingInput combines trusted fields without undefined values', async () => {
  const { buildKnowledgeEmbeddingInput } = await loadLogic()
  const text = buildKnowledgeEmbeddingInput({
    question: 'How do I say hello?',
    answer: 'Բարեւ',
    category: 'greetings',
    keywords: ['hello', 'greeting'],
  })
  assert.equal(text, 'Question: How do I say hello?\nAnswer: Բարեւ\nCategory: greetings\nKeywords: hello, greeting')
})
