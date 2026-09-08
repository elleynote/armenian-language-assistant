const root = document.getElementById('tun-armenian-assistant')

if (root) {
  const config = window.TunArmenianAssistantConfig || {}
  const form = root.querySelector('[data-taa-form]')
  const input = root.querySelector('[data-taa-input]')
  const sendButton = root.querySelector('[data-taa-send]')
  const resetButton = root.querySelector('[data-taa-reset]')
  const messages = root.querySelector('[data-taa-messages]')
  const status = root.querySelector('[data-taa-status]')
  const keyboard = root.querySelector('[data-taa-keyboard]')
  const keyboardToggle = root.querySelector('[data-taa-keyboard-toggle]')
  const configWarning = root.querySelector('[data-taa-config-warning]')

  root.style.setProperty('--taa-accent', config.accent || '#7f2d3f')
  const titleNode = root.querySelector('[data-taa-title]')
  const introNode = root.querySelector('[data-taa-intro]')
  if (titleNode && config.title) titleNode.textContent = config.title
  if (introNode && config.intro) introNode.textContent = config.intro

  const apiReady = typeof config.apiUrl === 'string' && !config.apiUrl.includes('YOUR_PROJECT_REF')
  if (!apiReady) configWarning?.classList.remove('taa-hidden')

  function randomId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
    return `browser-${Date.now()}-${Math.random().toString(36).slice(2)}`
  }

  function getClientId() {
    let clientId = localStorage.getItem(STORAGE_KEYS.clientId)
    if (!clientId) {
      clientId = randomId()
      localStorage.setItem(STORAGE_KEYS.clientId, clientId)
    }
    return clientId
  }

  function getSessionId() {
    return localStorage.getItem(STORAGE_KEYS.sessionId) || ''
  }

  function setSessionId(sessionId) {
    if (sessionId) localStorage.setItem(STORAGE_KEYS.sessionId, sessionId)
  }

  function setBusy(isBusy) {
    input.disabled = isBusy
    sendButton.disabled = isBusy || !apiReady
    resetButton.disabled = isBusy
    keyboardToggle.disabled = isBusy
    for (const key of keyboard.querySelectorAll('button')) key.disabled = isBusy
    status.textContent = isBusy ? 'Thinking…' : ''
  }

  function addMessage(role, text, source = '') {
    const row = document.createElement('div')
    row.className = `taa-message taa-message--${role}`

    const bubble = document.createElement('div')
    bubble.className = 'taa-bubble'
    bubble.textContent = text

    if (role === 'assistant' && source) {
      const label = document.createElement('span')
      label.className = 'taa-source'
      label.textContent = source === 'database' ? 'From trusted school knowledge' : 'AI-assisted answer'
      bubble.appendChild(label)
    }

    row.appendChild(bubble)
    messages.appendChild(row)
    messages.scrollTop = messages.scrollHeight
  }

  async function sendQuestion() {
    const message = input.value.trim()
    if (!message || !apiReady) return

    addMessage('user', message)
    input.value = ''
    setBusy(true)

    try {
      const response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildChatPayload({
          message,
          clientId: getClientId(),
          sessionId: getSessionId(),
        })),
      })

      let payload = {}
      try { payload = await response.json() } catch { /* handled below */ }

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Too many questions were sent in a short time. Please try again shortly.')
        }
        throw new Error(payload.error || 'The assistant could not answer right now. Please try again.')
      }

      if (!payload.answer || !payload.sessionId) throw new Error('The assistant returned an incomplete response.')
      setSessionId(payload.sessionId)
      addMessage('assistant', payload.answer, payload.source)
    } catch (error) {
      addMessage('assistant', error?.message || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
      input.focus()
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault()
    sendQuestion()
  })

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (!sendButton.disabled) form.requestSubmit()
    }
  })

  keyboardToggle.addEventListener('click', () => {
    const willOpen = keyboard.classList.contains('taa-hidden')
    keyboard.classList.toggle('taa-hidden', !willOpen)
    keyboardToggle.setAttribute('aria-expanded', String(willOpen))
    if (willOpen) input.focus()
  })

  for (const letter of ARMENIAN_KEYS) {
    const key = document.createElement('button')
    key.type = 'button'
    key.className = 'taa-key'
    key.textContent = letter
    key.setAttribute('aria-label', `Insert ${letter}`)
    key.addEventListener('click', () => {
      const result = insertAtSelection(input.value, letter, input.selectionStart, input.selectionEnd)
      input.value = result.value
      input.focus()
      input.setSelectionRange(result.cursor, result.cursor)
    })
    keyboard.appendChild(key)
  }

  resetButton.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEYS.sessionId)
    messages.replaceChildren()
    addMessage('assistant', 'Բարեւ։ Ask me a question about Western Armenian.')
    input.value = ''
    status.textContent = ''
    input.focus()
  })

  if (!apiReady) {
    sendButton.disabled = true
    status.textContent = 'Configure the Supabase API URL before publishing.'
  }
}
