export const DEFAULT_THRESHOLDS = Object.freeze({
  lexicalDirect: 0.9,
  lexicalContext: 0.65,
  semanticDirect: 0.86,
  semanticContext: 0.68,
})

export function validateChatPayload(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('Request body must be a JSON object')
  }

  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) throw new Error('message is required')
  if (message.length > 2000) throw new Error('message must be 2000 characters or fewer')

  const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : ''
  if (!clientId) throw new Error('clientId is required')
  if (clientId.length < 8 || clientId.length > 128) {
    throw new Error('clientId must be between 8 and 128 characters')
  }

  const language = body.language === undefined || body.language === null || body.language === ''
    ? 'hyw'
    : String(body.language).trim()
  if (language !== 'hyw' && language !== 'hye') {
    throw new Error('language must be hyw or hye')
  }

  let sessionId = null
  if (body.sessionId !== undefined && body.sessionId !== null && body.sessionId !== '') {
    const sessionPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (typeof body.sessionId !== 'string' || !sessionPattern.test(body.sessionId)) {
      throw new Error('sessionId is invalid')
    }
    sessionId = body.sessionId
  }

  return { message, clientId, sessionId, language }
}

export function filterKnowledgeByLanguage(matches = [], language = 'hyw') {
  return matches.filter((match) => {
    const value = String(match?.language ?? '').trim().toLocaleLowerCase('en')
    if (language === 'hye') {
      return value === 'hye' || value === 'eastern armenian'
    }
    return value === '' || value === 'hyw' || value === 'western armenian'
  })
}

export function chooseAnswerMode({
  lexical = [],
  semantic = [],
  thresholds = DEFAULT_THRESHOLDS,
} = {}) {
  const lexicalTop = lexical[0]
  if (lexicalTop && Number(lexicalTop.score) >= thresholds.lexicalDirect) {
    return { mode: 'database', match: lexicalTop }
  }

  const semanticTop = semantic[0]
  if (semanticTop && Number(semanticTop.similarity) >= thresholds.semanticDirect) {
    return { mode: 'database', match: semanticTop }
  }

  const contextMatches = [
    ...lexical.filter((match) => Number(match.score) >= thresholds.lexicalContext),
    ...semantic.filter((match) => Number(match.similarity) >= thresholds.semanticContext),
  ].slice(0, 4)

  if (contextMatches.length) {
    return { mode: 'ai_with_context', matches: contextMatches }
  }

  return { mode: 'ai_fallback', matches: [] }
}

export function extractOutputText(response) {
  if (!response || typeof response !== 'object') return ''
  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim()
  }

  const chunks = []
  for (const item of Array.isArray(response.output) ? response.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (part?.type === 'output_text' && typeof part.text === 'string') {
        chunks.push(part.text)
      }
    }
  }
  return chunks.join('').trim()
}

export function getAllowedCorsOrigin(origin, allowedOrigins = []) {
  const cleaned = allowedOrigins.map((value) => String(value).trim()).filter(Boolean)
  if (cleaned.includes('*')) return '*'
  if (!origin) return null
  return cleaned.includes(origin) ? origin : null
}

export function parseAllowedOrigins(value) {
  if (!value) return []
  return String(value)
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean)
}

export function resolveSupabaseSecretKey({ secretKeysJson, singleSecretKey, legacyServiceRoleKey } = {}) {
  if (secretKeysJson) {
    try {
      const parsed = JSON.parse(secretKeysJson)
      if (parsed && typeof parsed.default === 'string' && parsed.default.trim()) {
        return parsed.default.trim()
      }
    } catch {
      // Fall through to the legacy key for projects not yet migrated.
    }
  }
  if (typeof singleSecretKey === 'string' && singleSecretKey.trim()) {
    return singleSecretKey.trim()
  }
  if (typeof legacyServiceRoleKey === 'string' && legacyServiceRoleKey.trim()) {
    return legacyServiceRoleKey.trim()
  }
  throw new Error('Supabase server secret key is not configured')
}

export async function hashClientIdentity({ clientId, ip = 'unknown', salt }) {
  if (!salt) throw new Error('CHATBOT_HASH_SALT is required')
  const input = `${salt}|${ip || 'unknown'}|${clientId}`
  const bytes = new TextEncoder().encode(input)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function formatKnowledgeContext(matches = []) {
  const seen = new Set()
  const blocks = []
  for (const match of matches) {
    if (!match || !match.id || seen.has(match.id)) continue
    seen.add(match.id)
    const number = blocks.length + 1
    const source = match.source ? `\nSource: ${String(match.source).trim()}` : ''
    blocks.push(
      `TRUSTED KNOWLEDGE ${number}\nQuestion: ${String(match.question ?? '').trim()}\nAnswer: ${String(match.answer ?? '').trim()}${source}`,
    )
    if (blocks.length >= 4) break
  }
  return blocks.join('\n\n')
}

export function normalizeSearchText(value) {
  return String(value ?? '')
    .toLocaleLowerCase('en')
    .replace(/[\p{P}\p{Z}\s]+/gu, ' ')
    .trim()
}
