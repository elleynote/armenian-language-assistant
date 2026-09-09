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
  const languageSelect = root.querySelector('[data-taa-language]')
  const configWarning = root.querySelector('[data-taa-config-warning]')

  root.style.setProperty('--taa-accent', config.accent || '#DB182B')

  function syncViewportHeight() {
    const viewportHeight = window.visualViewport?.height || window.innerHeight
    const topOffset = root.getBoundingClientRect().top
    const availableHeight = calculateAvailableViewportHeight(viewportHeight, topOffset)
    if (availableHeight > 0) {
      root.style.setProperty('--taa-viewport-height', `${availableHeight}px`)
    }
  }

  const titleNode = root.querySelector('[data-taa-title]')
  const introNode = root.querySelector('[data-taa-intro]')

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
    if (!sessionId) return
    localStorage.setItem(STORAGE_KEYS.sessionId, sessionId)
  }

  function clearSessionId() {
    localStorage.removeItem(STORAGE_KEYS.sessionId)
  }

  function getLanguage() {
    return languageSelect?.value === 'hye' ? 'hye' : 'hyw'
  }

  function languageCopy(language = getLanguage()) {
    if (language === 'hye') {
      return {
        title: 'Eastern Armenian Language Assistant',
        intro: 'Ask about Eastern Armenian vocabulary, grammar, phrases, spelling, and usage.',
        placeholder: 'Ask an Eastern Armenian question...',
        welcome: 'Բարեւ։ Ask me a question about Eastern Armenian.',
      }
    }

    return {
      title: config.title || 'Western Armenian Language Assistant',
      intro: config.intro || 'Ask about Western Armenian vocabulary, grammar, phrases, spelling, and usage.',
      placeholder: 'Ask a Western Armenian question...',
      welcome: 'Բարեւ։ Ask me a question about Western Armenian.',
    }
  }

  function applyLanguageCopy() {
    const copy = languageCopy()
    if (titleNode) titleNode.textContent = copy.title
    if (introNode) introNode.textContent = copy.intro
    if (input) input.placeholder = copy.placeholder
  }

  function setStatus(text = '') {
    if (status) status.textContent = text
  }

  function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight
  }

  function createMessage(role, text) {
    const wrapper = document.createElement('div')
    wrapper.className = `taa-message taa-message--${role}`

    const bubble = document.createElement('div')
    bubble.className = 'taa-bubble'
    bubble.innerHTML = escapeHtml(text)

    wrapper.appendChild(bubble)
    messages.appendChild(wrapper)
    scrollToBottom()
    return wrapper
  }

  function createTypingIndicator() {
    const wrapper = document.createElement('div')
    wrapper.className = 'taa-message taa-message--assistant taa-message--typing'
    wrapper.innerHTML = `
      <div class="taa-bubble">
        <span class="taa-typing" aria-label="Assistant is typing">
          <span class="taa-typing-dot"></span>
          <span class="taa-typing-dot"></span>
          <span class="taa-typing-dot"></span>
        </span>
      </div>
    `
    messages.appendChild(wrapper)
    scrollToBottom()
    return wrapper
  }

  function removeNode(node) {
    if (node && node.parentNode) {
      node.parentNode.removeChild(node)
    }
  }

  function setBusy(isBusy) {
    if (sendButton) sendButton.disabled = isBusy
    if (input) input.disabled = isBusy
    if (keyboardToggle) keyboardToggle.disabled = isBusy
    if (resetButton) resetButton.disabled = isBusy
    if (languageSelect) languageSelect.disabled = isBusy
  }

  function resetConversation() {
    const copy = languageCopy()
    messages.innerHTML = `
      <div class="taa-message taa-message--assistant">
        <div class="taa-bubble" data-taa-welcome>${escapeHtml(copy.welcome)}</div>
      </div>
    `
    clearSessionId()
    setStatus('')
    input.value = ''
    input.focus()
  }

  function toggleKeyboard() {
    const isHidden = keyboard.classList.contains('taa-hidden')
    keyboard.classList.toggle('taa-hidden')
    keyboardToggle.setAttribute('aria-expanded', String(isHidden))
  }

  function renderKeyboard() {
    keyboard.innerHTML = ''
    ARMENIAN_KEYS.forEach((letter) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = 'taa-key'
      button.textContent = letter
      button.addEventListener('click', () => {
        const next = insertAtSelection(
          input.value,
          letter,
          input.selectionStart,
          input.selectionEnd,
        )
        input.value = next.value
        input.focus()
        input.setSelectionRange(next.cursor, next.cursor)
      })
      keyboard.appendChild(button)
    })
  }

  async function sendMessage(message) {
    const payload = buildChatPayload({
      message,
      clientId: getClientId(),
      sessionId: getSessionId(),
      language: getLanguage(),
    })

    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      const errorMessage = data?.error || data?.message || 'Something went wrong. Please try again.'
      throw new Error(errorMessage)
    }

    return data
  }

  keyboardToggle?.addEventListener('click', toggleKeyboard)
  resetButton?.addEventListener('click', resetConversation)
  languageSelect?.addEventListener('change', () => {
    applyLanguageCopy()
    clearSessionId()
    resetConversation()
  })

  input?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      form.requestSubmit()
    }
  })

  form?.addEventListener('submit', async (event) => {
    event.preventDefault()

    const message = String(input.value || '').trim()
    if (!message) return

    if (!apiReady) {
      setStatus('Setup required: API URL is not configured yet.')
      return
    }

    createMessage('user', message)
    input.value = ''
    setStatus('')
    setBusy(true)

    const typingNode = createTypingIndicator()

    try {
      const data = await sendMessage(message)
      removeNode(typingNode)
      createMessage('assistant', data.answer || 'No response received.')
      if (data.sessionId) setSessionId(data.sessionId)
    } catch (error) {
      removeNode(typingNode)
      createMessage('assistant', 'Sorry, there was a problem. Please try again.')
      setStatus(error?.message || 'Unable to reach the assistant right now.')
    } finally {
      setBusy(false)
      input.focus()
    }
  })

  syncViewportHeight()
  window.addEventListener('resize', syncViewportHeight)
  window.visualViewport?.addEventListener('resize', syncViewportHeight)

  applyLanguageCopy()
  renderKeyboard()
  setStatus('')
}