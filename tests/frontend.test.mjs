import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const coreUrl = new URL('../frontend/core.mjs', import.meta.url)

async function loadCore() {
  try {
    return await import(`${coreUrl.href}?v=${Date.now()}`)
  } catch (error) {
    assert.fail(`frontend core module is required: ${error.message}`)
  }
}

test('buildChatPayload trims message and keeps stable identifiers', async () => {
  const { buildChatPayload } = await loadCore()
  assert.deepEqual(
    buildChatPayload({
      message: '  How do I say hello?  ',
      clientId: 'client-123',
      sessionId: '123e4567-e89b-12d3-a456-426614174000',
    }),
    {
      message: 'How do I say hello?',
      clientId: 'client-123',
      sessionId: '123e4567-e89b-12d3-a456-426614174000',
    },
  )
})

test('buildChatPayload omits an empty session id', async () => {
  const { buildChatPayload } = await loadCore()
  assert.deepEqual(
    buildChatPayload({ message: 'Barev', clientId: 'client-123', sessionId: '' }),
    { message: 'Barev', clientId: 'client-123' },
  )
})

test('storage keys are namespaced for the Armenian assistant', async () => {
  const { STORAGE_KEYS } = await loadCore()
  assert.deepEqual(STORAGE_KEYS, {
    clientId: 'tunArmenianAssistant.clientId',
    sessionId: 'tunArmenianAssistant.sessionId',
  })
})

test('escapeHtml neutralizes unsafe markup', async () => {
  const { escapeHtml } = await loadCore()
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">&'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;',
  )
})

test('insertAtSelection inserts an Armenian letter at the cursor', async () => {
  const { insertAtSelection } = await loadCore()
  assert.deepEqual(insertAtSelection('բար', 'ե', 3, 3), { value: 'բարե', cursor: 4 })
  assert.deepEqual(insertAtSelection('բXր', 'ա', 1, 2), { value: 'բար', cursor: 2 })
})

test('Armenian keyboard exposes the expected 39-key Eastern/Western Unicode layout', async () => {
  const { ARMENIAN_KEYS } = await loadCore()
  assert.equal(ARMENIAN_KEYS.length, 39)
  assert.equal(ARMENIAN_KEYS[0], 'ա')
  assert.ok(ARMENIAN_KEYS.includes('և'))
  assert.equal(ARMENIAN_KEYS.at(-1), 'ֆ')
})

test('WordPress embed is self-contained and contains no secret keys', async () => {
  let html
  try {
    html = await readFile(new URL('../embed/wordpress-embed.html', import.meta.url), 'utf8')
  } catch (error) {
    assert.fail(`generated WordPress embed is required: ${error.message}`)
  }
  assert.match(html, /id="tun-armenian-assistant"/)
  assert.match(html, /TunArmenianAssistantConfig/)
  assert.match(html, /YOUR_PROJECT_REF/)
  assert.doesNotMatch(html, /OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEYS/)
  assert.doesNotMatch(html, /<script[^>]+src=/i)
  assert.doesNotMatch(html, /<link[^>]+stylesheet/i)
})
