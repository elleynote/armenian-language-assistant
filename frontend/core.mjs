export const STORAGE_KEYS = Object.freeze({
  clientId: 'tunArmenianAssistant.clientId',
  sessionId: 'tunArmenianAssistant.sessionId',
})

export const ARMENIAN_KEYS = Object.freeze([
  'ա', 'բ', 'գ', 'դ', 'ե', 'զ', 'է', 'ը', 'թ', 'ժ',
  'ի', 'լ', 'խ', 'ծ', 'կ', 'հ', 'ձ', 'ղ', 'ճ', 'մ',
  'յ', 'ն', 'շ', 'ո', 'չ', 'պ', 'ջ', 'ռ', 'ս', 'վ',
  'տ', 'ր', 'ց', 'ւ', 'փ', 'ք', 'և', 'օ', 'ֆ',
])

export function buildChatPayload({ message, clientId, sessionId, language = 'hyw' } = {}) {
  const payload = {
    message: String(message ?? '').trim(),
    clientId: String(clientId ?? '').trim(),
    language: language === 'hye' ? 'hye' : 'hyw',
  }
  const cleanSessionId = String(sessionId ?? '').trim()
  if (cleanSessionId) payload.sessionId = cleanSessionId
  return payload
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function insertAtSelection(value, insert, selectionStart, selectionEnd) {
  const source = String(value ?? '')
  const text = String(insert ?? '')
  const start = Number.isInteger(selectionStart) ? selectionStart : source.length
  const end = Number.isInteger(selectionEnd) ? selectionEnd : start
  const nextValue = `${source.slice(0, start)}${text}${source.slice(end)}`
  return { value: nextValue, cursor: start + text.length }
}

export function calculateAvailableViewportHeight(viewportHeight, topOffset) {
  const height = Number(viewportHeight)
  const top = Number(topOffset)
  if (!Number.isFinite(height) || height <= 0) return 0
  if (!Number.isFinite(top) || top <= 0 || top >= height) return height
  return Math.max(0, height - top)
}
