const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function validateEmbedRequest(body) {
  const knowledgeId = typeof body?.knowledgeId === 'string' ? body.knowledgeId.trim() : ''
  if (!UUID_PATTERN.test(knowledgeId)) {
    throw new Error('knowledgeId must be a valid UUID')
  }
  return { knowledgeId }
}

export function extractEmbedding(payload, expectedDimensions = 512) {
  const embedding = payload?.data?.[0]?.embedding
  if (!Array.isArray(embedding) || embedding.length !== expectedDimensions) {
    throw new Error(`Embedding response must contain exactly ${expectedDimensions} dimensions`)
  }
  if (!embedding.every((value) => typeof value === 'number' && Number.isFinite(value))) {
    throw new Error('Embedding response contains invalid values')
  }
  return embedding
}

export function buildKnowledgeEmbeddingInput({ question, answer, category, keywords } = {}) {
  const lines = [
    `Question: ${String(question ?? '').trim()}`,
    `Answer: ${String(answer ?? '').trim()}`,
  ]

  const cleanCategory = String(category ?? '').trim()
  if (cleanCategory) lines.push(`Category: ${cleanCategory}`)

  const cleanKeywords = Array.isArray(keywords)
    ? keywords.map((item) => String(item).trim()).filter(Boolean)
    : []
  if (cleanKeywords.length) lines.push(`Keywords: ${cleanKeywords.join(', ')}`)

  return lines.join('\n')
}
