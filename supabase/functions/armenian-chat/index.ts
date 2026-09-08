import { createClient } from 'npm:@supabase/supabase-js@2'
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
} from './logic.js'

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses'
const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings'
const DEFAULT_CHAT_MODEL = 'gpt-5.6-luna'
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 512

const SYSTEM_PROMPT = `You are the Western Armenian Language Assistant for an online Armenian school.

Rules:
- Focus on Western Armenian (hyw), not Eastern Armenian, unless the learner explicitly asks for a comparison.
- When TRUSTED KNOWLEDGE is supplied, treat it as the primary authority. Do not contradict it with general model knowledge.
- Preserve Armenian spelling carefully. Never invent a conjugation, spelling, or grammar rule just to sound confident.
- When no trusted context is available and you are uncertain, clearly say that you are not fully certain and suggest that the learner verify with the school material.
- Keep explanations learner-friendly and concise. Give examples when useful.
- You may answer in English or Armenian based on the learner's question. When useful, include Western Armenian script and a short explanation.
- When transliterating Western Armenian, follow the school's transliteration rules exactly:
  - ե is transliterated as 'ye' when it is at the beginning of a word and 'e' when it is in the middle or end of a word.
  - Exception: ես is transliterated as 'yes' when it is at the beginning of a sentence, and 'es' when it is in the middle or end of a sentence.
  - Exception: եմ is always transliterated as 'em'.
  - ո is transliterated as 'vo' when it is at the beginning of a word and 'o' when it is in the middle or end of a word.
  - Do not substitute another transliteration convention when these rules apply.
  - When a learner asks for transliteration, normally show the Armenian script together with the transliteration unless they explicitly ask for transliteration only.
- If a question is unrelated to Armenian language learning, politely redirect to Armenian language learning.`

class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function numberEnv(name: string, fallback: number): number {
  const value = Number(Deno.env.get(name))
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function corsHeaders(allowedOrigin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  }
  if (allowedOrigin) headers['Access-Control-Allow-Origin'] = allowedOrigin
  return headers
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  allowedOrigin: string | null,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(allowedOrigin),
      ...extraHeaders,
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

function requestIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return (
    req.headers.get('cf-connecting-ip')?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    forwarded ||
    'unknown'
  )
}

function createAdminClient() {
  const supabaseUrl = requireEnv('SUPABASE_URL')
  const secretKey = resolveSupabaseSecretKey({
    secretKeysJson: Deno.env.get('SUPABASE_SECRET_KEYS'),
    singleSecretKey: Deno.env.get('SUPABASE_SECRET_KEY'),
    legacyServiceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  })

  return createClient(supabaseUrl, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

type AdminClient = ReturnType<typeof createAdminClient>
type KnowledgeMatch = {
  id: string
  question: string
  answer: string
  category?: string | null
  language?: string | null
  source?: string | null
  score?: number
  similarity?: number
}

async function getOrCreateSession(
  admin: AdminClient,
  requestedSessionId: string | null,
  clientHash: string,
): Promise<string> {
  if (requestedSessionId) {
    const { data, error } = await admin
      .from('chatbot_sessions')
      .select('id, client_hash')
      .eq('id', requestedSessionId)
      .maybeSingle()

    if (!error && data?.id && data.client_hash === clientHash) {
      await admin
        .from('chatbot_sessions')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', data.id)
      return data.id
    }
  }

  const { data, error } = await admin
    .from('chatbot_sessions')
    .insert({ client_hash: clientHash })
    .select('id')
    .single()

  if (error || !data?.id) throw new Error(`Could not create chat session: ${error?.message ?? 'unknown error'}`)
  return data.id
}

async function getRecentHistory(admin: AdminClient, sessionId: string) {
  const { data, error } = await admin
    .from('chatbot_messages')
    .select('role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(6)

  if (error) throw new Error(`Could not load chat history: ${error.message}`)
  return (data ?? []).reverse()
}

async function logMessage(
  admin: AdminClient,
  values: {
    sessionId: string
    role: 'user' | 'assistant'
    content: string
    source: 'user' | 'database' | 'ai_with_context' | 'ai_fallback'
    knowledgeId?: string | null
  },
) {
  const { error } = await admin.from('chatbot_messages').insert({
    session_id: values.sessionId,
    role: values.role,
    content: values.content,
    source: values.source,
    knowledge_id: values.knowledgeId ?? null,
  })
  if (error) throw new Error(`Could not save chat message: ${error.message}`)
}

async function searchLexical(admin: AdminClient, message: string): Promise<KnowledgeMatch[]> {
  const { data, error } = await admin.rpc('search_chatbot_knowledge_lexical', {
    p_query: message,
    p_match_count: 5,
  })
  if (error) throw new Error(`Lexical knowledge search failed: ${error.message}`)
  return (data ?? []) as KnowledgeMatch[]
}

async function createEmbedding(message: string): Promise<number[]> {
  const apiKey = requireEnv('OPENAI_API_KEY')
  const model = Deno.env.get('OPENAI_EMBEDDING_MODEL')?.trim() || DEFAULT_EMBEDDING_MODEL
  const response = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: message,
      dimensions: EMBEDDING_DIMENSIONS,
      encoding_format: 'float',
    }),
  })

  const payload = await response.json().catch(() => ({}))
  const embedding = payload?.data?.[0]?.embedding
  if (!response.ok || !Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`OpenAI embedding request failed with status ${response.status}`)
  }
  return embedding
}

async function searchSemantic(admin: AdminClient, embedding: number[]): Promise<KnowledgeMatch[]> {
  const { data, error } = await admin.rpc('match_chatbot_knowledge', {
    p_query_embedding: embedding,
    p_match_threshold: 0.68,
    p_match_count: 4,
  })
  if (error) throw new Error(`Semantic knowledge search failed: ${error.message}`)
  return (data ?? []) as KnowledgeMatch[]
}

function formatHistory(history: Array<{ role: string; content: string }>): string {
  if (!history.length) return 'No previous conversation.'
  return history
    .map((item) => {
      const speaker = item.role === 'assistant' ? 'Assistant' : 'Student'
      const content = String(item.content ?? '').slice(0, 1500)
      return `${speaker}: ${content}`
    })
    .join('\n')
}

async function generateAiAnswer(args: {
  message: string
  history: Array<{ role: string; content: string }>
  contextMatches: KnowledgeMatch[]
  clientHash: string
}): Promise<string> {
  const apiKey = requireEnv('OPENAI_API_KEY')
  const model = Deno.env.get('OPENAI_CHAT_MODEL')?.trim() || DEFAULT_CHAT_MODEL
  const trustedContext = formatKnowledgeContext(args.contextMatches)
  const input = `Previous conversation:\n${formatHistory(args.history)}\n\n${
    trustedContext ? `${trustedContext}\n\n` : 'No trusted knowledge matched this question.\n\n'
  }Current learner question:\n${args.message}`

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      instructions: SYSTEM_PROMPT,
      input,
      store: false,
      reasoning: { effort: Deno.env.get('OPENAI_REASONING_EFFORT')?.trim() || 'none' },
      text: { verbosity: 'low' },
      max_output_tokens: 800,
      safety_identifier: args.clientHash.slice(0, 64),
    }),
  })

  const payload = await response.json().catch(() => ({}))
  const answer = extractOutputText(payload)
  if (!response.ok || !answer) {
    throw new HttpError(502, 'The language assistant could not generate an answer right now.')
  }
  return answer
}

async function recordAiReview(
  admin: AdminClient,
  question: string,
  answer: string,
  contextMatches: KnowledgeMatch[],
) {
  const normalizedQuestion = normalizeSearchText(question)
  if (!normalizedQuestion) return

  const { data: existing, error: lookupError } = await admin
    .from('chatbot_ai_answers')
    .select('id, times_asked, status')
    .eq('normalized_question', normalizedQuestion)
    .maybeSingle()

  if (lookupError) {
    console.warn('Could not check existing AI review row:', lookupError.message)
    return
  }

  const contextIds = [...new Set(contextMatches.map((match) => match.id).filter(Boolean))]

  if (existing?.id) {
    if (existing.status !== 'pending') return
    const { error } = await admin
      .from('chatbot_ai_answers')
      .update({
        question,
        answer,
        context_ids: contextIds,
        times_asked: Number(existing.times_asked ?? 0) + 1,
      })
      .eq('id', existing.id)
    if (error) console.warn('Could not update AI review row:', error.message)
    return
  }

  const { error } = await admin.from('chatbot_ai_answers').insert({
    normalized_question: normalizedQuestion,
    question,
    answer,
    context_ids: contextIds,
    status: 'pending',
  })
  if (error) console.warn('Could not save AI review row:', error.message)
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')?.replace(/\/$/, '') || null
  const configuredOrigins = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS') || '')
  const allowedOrigin = getAllowedCorsOrigin(origin, configuredOrigins)

  if (origin && !allowedOrigin) {
    return jsonResponse({ error: 'Origin is not allowed.' }, 403, null)
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(allowedOrigin) })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405, allowedOrigin, { Allow: 'POST, OPTIONS' })
  }

  try {
    let body: unknown
    try {
      body = await req.json()
    } catch {
      throw new HttpError(400, 'Request body must be valid JSON.')
    }

    let payload
    try {
      payload = validateChatPayload(body)
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'Invalid request.')
    }

    const admin = createAdminClient()
    const clientHash = await hashClientIdentity({
      clientId: payload.clientId,
      ip: requestIp(req),
      salt: requireEnv('CHATBOT_HASH_SALT'),
    })

    const maxRequests = numberEnv('CHATBOT_RATE_LIMIT_MAX', 20)
    const windowSeconds = numberEnv('CHATBOT_RATE_LIMIT_WINDOW_SECONDS', 600)
    const { data: rateRows, error: rateError } = await admin.rpc('consume_chatbot_rate_limit', {
      p_key: clientHash,
      p_max_requests: maxRequests,
      p_window_seconds: windowSeconds,
    })
    if (rateError) throw new Error(`Rate limit check failed: ${rateError.message}`)

    const rate = Array.isArray(rateRows) ? rateRows[0] : rateRows
    if (!rate?.allowed) {
      return jsonResponse(
        { error: 'Too many questions. Please try again shortly.' },
        429,
        allowedOrigin,
        rate?.reset_at ? { 'Retry-After': String(Math.max(1, Math.ceil((Date.parse(rate.reset_at) - Date.now()) / 1000))) } : {},
      )
    }

    const sessionId = await getOrCreateSession(admin, payload.sessionId, clientHash)
    const history = await getRecentHistory(admin, sessionId)
    await logMessage(admin, {
      sessionId,
      role: 'user',
      content: payload.message,
      source: 'user',
    })

    // Stage A: database-only lexical search. A strong hit returns before any OpenAI request.
    const lexicalMatches = await searchLexical(admin, payload.message)
    const lexicalDecision = chooseAnswerMode({ lexical: lexicalMatches, semantic: [] })

    let answer: string
    let source: 'database' | 'ai_with_context' | 'ai_fallback'
    let knowledgeId: string | null = null
    let contextMatches: KnowledgeMatch[] = []

    if (lexicalDecision.mode === 'database') {
      answer = lexicalDecision.match.answer
      source = 'database'
      knowledgeId = lexicalDecision.match.id
    } else {
      // Stage B: semantic retrieval only after the database-only lexical stage did not answer directly.
      let semanticMatches: KnowledgeMatch[] = []
      try {
        const embedding = await createEmbedding(payload.message)
        semanticMatches = await searchSemantic(admin, embedding)
      } catch (error) {
        console.warn('Semantic search unavailable; continuing with lexical context:', error)
      }

      const decision = chooseAnswerMode({ lexical: lexicalMatches, semantic: semanticMatches })
      if (decision.mode === 'database') {
        answer = decision.match.answer
        source = 'database'
        knowledgeId = decision.match.id
      } else {
        contextMatches = decision.matches as KnowledgeMatch[]
        if (decision.mode !== 'ai_with_context' && decision.mode !== 'ai_fallback') {
          throw new Error(`Unexpected answer mode: ${decision.mode}`)
        }
        source = decision.mode
        answer = await generateAiAnswer({
          message: payload.message,
          history,
          contextMatches,
          clientHash,
        })
        await recordAiReview(admin, payload.message, answer, contextMatches)
      }
    }

    await logMessage(admin, {
      sessionId,
      role: 'assistant',
      content: answer,
      source,
      knowledgeId,
    })

    return jsonResponse(
      {
        answer,
        source,
        sessionId,
      },
      200,
      allowedOrigin,
      { 'Cache-Control': 'no-store' },
    )
  } catch (error) {
    console.error('armenian-chat error:', error)
    const status = error instanceof HttpError ? error.status : 500
    const message = error instanceof HttpError ? error.message : 'The language assistant is temporarily unavailable.'
    return jsonResponse({ error: message }, status, allowedOrigin, { 'Cache-Control': 'no-store' })
  }
})
