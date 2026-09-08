import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migrationUrl = new URL('../supabase/migrations/202609090001_armenian_chatbot.sql', import.meta.url)
const sql = await readFile(migrationUrl, 'utf8')

const requiredTables = [
  'chatbot_knowledge',
  'chatbot_question_aliases',
  'chatbot_sessions',
  'chatbot_messages',
  'chatbot_ai_answers',
  'chatbot_rate_limits',
]

test('migration enables vector and trigram extensions', () => {
  assert.match(sql, /create extension if not exists vector/i)
  assert.match(sql, /create extension if not exists pg_trgm/i)
})

test('migration creates every chatbot table', () => {
  for (const table of requiredTables) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}`, 'i'))
  }
})

test('knowledge embeddings use 512 dimensions', () => {
  assert.match(sql, /embedding\s+extensions\.vector\(512\)/i)
})

test('migration creates normalization triggers', () => {
  assert.match(sql, /chatbot_normalize_text/i)
  assert.match(sql, /chatbot_knowledge_normalize_trigger/i)
  assert.match(sql, /chatbot_alias_normalize_trigger/i)
})

test('migration creates lexical vector and rate-limit RPCs', () => {
  assert.match(sql, /function public\.search_chatbot_knowledge_lexical/i)
  assert.match(sql, /function public\.match_chatbot_knowledge/i)
  assert.match(sql, /function public\.consume_chatbot_rate_limit/i)
})

test('retrieval RPCs restrict authoritative knowledge to approved rows', () => {
  const approvedFilters = sql.match(/is_approved\s*=\s*true/gi) ?? []
  assert.ok(approvedFilters.length >= 2, 'expected approved-only filters in lexical and vector retrieval')
})

test('RLS is enabled for every chatbot table', () => {
  for (const table of requiredTables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
  }
})

test('migration does not grant chatbot table access to anon', () => {
  assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete|all).*\s+to\s+anon/i)
})

test('migration defines a vector similarity index', () => {
  assert.match(sql, /using hnsw\s*\(embedding\s+vector_cosine_ops\)/i)
})
