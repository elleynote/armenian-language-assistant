import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveSupabaseSecretKey } from '../armenian-chat/logic.js'
import {
  buildKnowledgeEmbeddingInput,
  extractEmbedding,
  validateEmbedRequest,
} from './logic.js'

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings'
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small'

function requireEnv(name: string): string {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function createAdminClient() {
  const secretKey = resolveSupabaseSecretKey({
    secretKeysJson: Deno.env.get('SUPABASE_SECRET_KEYS'),
    singleSecretKey: Deno.env.get('SUPABASE_SECRET_KEY'),
    legacyServiceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  })

  return createClient(requireEnv('SUPABASE_URL'), secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

async function createEmbedding(input: string): Promise<number[]> {
  const response = await fetch(OPENAI_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${requireEnv('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: Deno.env.get('OPENAI_EMBEDDING_MODEL')?.trim() || DEFAULT_EMBEDDING_MODEL,
      input,
      dimensions: 512,
      encoding_format: 'float',
    }),
  })

  if (!response.ok) {
    console.error('OpenAI embedding request failed', response.status, await response.text())
    throw new Error('Embedding provider request failed')
  }

  return extractEmbedding(await response.json(), 512)
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

    const expectedSecret = requireEnv('KNOWLEDGE_ADMIN_SECRET')
    const providedSecret = req.headers.get('x-admin-secret')?.trim() || ''
    if (!providedSecret || providedSecret !== expectedSecret) {
      return jsonResponse({ error: 'Unauthorized' }, 401)
    }

    const { knowledgeId } = validateEmbedRequest(await req.json())
    const admin = createAdminClient()

    const { data: knowledge, error: readError } = await admin
      .from('chatbot_knowledge')
      .select('id, question, answer, category, keywords, is_approved')
      .eq('id', knowledgeId)
      .single()

    if (readError || !knowledge) return jsonResponse({ error: 'Knowledge entry not found' }, 404)
    if (!knowledge.is_approved) {
      return jsonResponse({ error: 'Only approved knowledge can be embedded' }, 409)
    }

    const input = buildKnowledgeEmbeddingInput(knowledge)
    const embedding = await createEmbedding(input)

    const { error: updateError } = await admin
      .from('chatbot_knowledge')
      .update({ embedding, updated_at: new Date().toISOString() })
      .eq('id', knowledgeId)

    if (updateError) {
      console.error('Failed to store knowledge embedding', updateError)
      throw new Error('Could not save embedding')
    }

    return jsonResponse({ ok: true, knowledgeId, dimensions: embedding.length })
  } catch (error) {
    console.error('embed-knowledge error', error)
    return jsonResponse({ error: 'Could not create knowledge embedding' }, 500)
  }
})
