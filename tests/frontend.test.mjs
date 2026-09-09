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

test('buildChatPayload trims message, keeps identifiers, and sends selected language', async () => {
  const { buildChatPayload } = await loadCore()
  assert.deepEqual(
    buildChatPayload({
      message: '  How do I say hello?  ',
      clientId: 'client-123',
      sessionId: '123e4567-e89b-12d3-a456-426614174000',
      language: 'hye',
    }),
    {
      message: 'How do I say hello?',
      clientId: 'client-123',
      sessionId: '123e4567-e89b-12d3-a456-426614174000',
      language: 'hye',
    },
  )
})

test('buildChatPayload defaults language to Western Armenian and omits an empty session id', async () => {
  const { buildChatPayload } = await loadCore()
  assert.deepEqual(
    buildChatPayload({ message: 'Barev', clientId: 'client-123', sessionId: '' }),
    { message: 'Barev', clientId: 'client-123', language: 'hyw' },
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

test('chat height uses only viewport space remaining below its top offset', async () => {
  const { calculateAvailableViewportHeight } = await loadCore()
  assert.equal(calculateAvailableViewportHeight(900, 180), 720)
  assert.equal(calculateAvailableViewportHeight(900, -40), 900)
  assert.equal(calculateAvailableViewportHeight(900, 920), 900)
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

test('frontend exposes Western and Eastern Armenian mode selection', async () => {
  const html = await readFile(new URL('../frontend/template.html', import.meta.url), 'utf8')
  assert.match(html, /data-taa-language/)
  assert.match(html, /value="hyw"[^>]*>Western Armenian</)
  assert.match(html, /value="hye"[^>]*>Eastern Armenian</)
})

test('chatbot uses Tun branding and fits the remaining viewport without top padding', async () => {
  const css = await readFile(new URL('../frontend/styles.css', import.meta.url), 'utf8')
  const app = await readFile(new URL('../frontend/app.js', import.meta.url), 'utf8')
  assert.match(css, /--taa-accent:\s*#db182b;/i)
  assert.match(css, /font-family:\s*['"]?Nunito/i)
  assert.match(css, /padding-top:\s*0;/)
  assert.match(css, /height:\s*var\(--taa-viewport-height,\s*100dvh\);/)
  assert.doesNotMatch(css, /min-height:\s*100dvh;/)
  assert.match(css, /\.taa-shell\s*\{[\s\S]*?display:\s*flex;[\s\S]*?flex-direction:\s*column;/)
  assert.match(css, /\.taa-messages\s*\{[\s\S]*?flex:\s*1\s+1\s+auto;/)
  assert.match(app, /calculateAvailableViewportHeight/)
  assert.match(app, /--taa-viewport-height/)
})

test('composer is compact so the conversation area gets more space', async () => {
  const html = await readFile(new URL('../frontend/template.html', import.meta.url), 'utf8')
  const css = await readFile(new URL('../frontend/styles.css', import.meta.url), 'utf8')
  assert.doesNotMatch(html, /Press Enter to send/)
  assert.match(html, /data-taa-input[\s\S]*?rows="2"/)
  assert.match(css, /\.taa-input\s*\{[\s\S]*?min-height:\s*60px;/)
  assert.match(css, /\.taa-status:empty\s*\{[\s\S]*?display:\s*none;/)
})

test('header centers and styles the new chat action', async () => {
  const css = await readFile(new URL('../frontend/styles.css', import.meta.url), 'utf8')
  assert.match(css, /\.taa-header\s*\{[\s\S]*?align-items:\s*center;/)
  assert.match(css, /\.taa-reset\s*\{[\s\S]*?display:\s*inline-flex;/)
  assert.match(css, /\.taa-reset\s*\{[\s\S]*?min-width:\s*110px;/)
})

test('frontend resets the session when Armenian variety changes', async () => {
  const app = await readFile(new URL('../frontend/app.js', import.meta.url), 'utf8')
  assert.match(app, /languageSelect\?\.addEventListener\(['"]change['"]/)
  assert.match(app, /clearSessionId\(\)/)
  assert.match(app, /language:\s*getLanguage\(\)/)
})

test('frontend does not expose answer source labels to visitors', async () => {
  const app = await readFile(new URL('../frontend/app.js', import.meta.url), 'utf8')
  assert.doesNotMatch(app, /Source:\s*(approved knowledge|AI)/)
  assert.doesNotMatch(app, /humanSourceLabel/)
})

test('frontend app has valid JavaScript syntax', async () => {
  const { spawnSync } = await import('node:child_process')
  const { fileURLToPath } = await import('node:url')

  const appPath = fileURLToPath(
    new URL('../frontend/app.js', import.meta.url)
  )

  const result = spawnSync(
    process.execPath,
    ['--check', appPath],
    { encoding: 'utf8' }
  )

  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout
  )
})