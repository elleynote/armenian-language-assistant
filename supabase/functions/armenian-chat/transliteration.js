const LETTERS = {
  ա: 'a',
  բ: 'p',
  գ: 'k',
  դ: 't',
  ե: 'e',
  զ: 'z',
  է: 'e',
  ը: 'ë',
  թ: "t'",
  ժ: 'zh',
  ի: 'i',
  լ: 'l',
  խ: 'kh',
  ծ: 'dz',
  կ: 'g',
  հ: 'h',
  ձ: 'ts',
  ղ: 'gh',
  ճ: 'j',
  մ: 'm',
  յ: 'y',
  ն: 'n',
  շ: 'sh',
  ո: 'o',
  չ: "ch'",
  պ: 'b',
  ջ: 'ch',
  ռ: 'r',
  ս: 's',
  վ: 'v',
  տ: 'd',
  ր: 'r',
  ց: "ts'",
  ւ: 'v',
  փ: "p'",
  ք: "k'",
  օ: 'o',
  ֆ: 'f',
}

function isArmenianLetter(value) {
  return /[\u0531-\u0556\u0561-\u0586]/u.test(value)
}

function isUppercaseArmenian(value) {
  return /[\u0531-\u0556]/u.test(value)
}

function lowerArmenian(value) {
  return value.toLocaleLowerCase('hy-AM')
}

function preserveCase(source, latin) {
  if (!isUppercaseArmenian(source) || !latin) return latin
  return latin[0].toUpperCase() + latin.slice(1)
}

function endsSentence(value) {
  return /[.!?\u055C\u055E\u0589\n\r]/u.test(value)
}

export function transliterateWesternArmenian(value) {
  const input = Array.from(String(value ?? '').normalize('NFC'))
  let output = ''
  let previousWasArmenian = false
  let atSentenceStart = true

  for (let index = 0; index < input.length; index += 1) {
    const current = input[index]
    const lower = lowerArmenian(current)
    const next = input[index + 1] ?? ''
    const nextLower = lowerArmenian(next)
    const afterNext = input[index + 2] ?? ''
    const wordStart = !previousWasArmenian

    if (wordStart && lower === 'ե' && nextLower === 'ս' && !isArmenianLetter(afterNext)) {
      output += preserveCase(current, atSentenceStart ? 'yes' : 'es')
      index += 1
      previousWasArmenian = true
      atSentenceStart = false
      continue
    }

    if (wordStart && lower === 'ե' && nextLower === 'մ' && !isArmenianLetter(afterNext)) {
      output += preserveCase(current, 'em')
      index += 1
      previousWasArmenian = true
      atSentenceStart = false
      continue
    }

    if (lower === 'ո' && nextLower === 'ւ') {
      output += preserveCase(current, 'u')
      index += 1
      previousWasArmenian = true
      atSentenceStart = false
      continue
    }

    if (lower === 'ե' && nextLower === 'ւ') {
      output += preserveCase(current, wordStart ? 'yev' : 'ev')
      index += 1
      previousWasArmenian = true
      atSentenceStart = false
      continue
    }

    if (lower === 'և') {
      output += preserveCase(current, wordStart ? 'yev' : 'ev')
      previousWasArmenian = true
      atSentenceStart = false
      continue
    }

    if (!isArmenianLetter(current)) {
      output += current
      previousWasArmenian = false
      if (endsSentence(current)) atSentenceStart = true
      continue
    }

    if (lower === 'ե') {
      output += preserveCase(current, wordStart ? 'ye' : 'e')
      previousWasArmenian = true
      atSentenceStart = false
      continue
    }

    if (lower === 'ո') {
      output += preserveCase(current, wordStart ? 'vo' : 'o')
      previousWasArmenian = true
      atSentenceStart = false
      continue
    }

    output += preserveCase(current, LETTERS[lower] ?? current)
    previousWasArmenian = true
    atSentenceStart = false
  }

  return output
}

function isTranslationRequest(question) {
  const normalized = String(question ?? '').toLocaleLowerCase('en')
  return /\b(translate|translation|how do i say|how do you say|what is .* in (western |eastern )?armenian|armenian (word )?for|what does .* mean)\b/i.test(normalized)
}

function armenianPhrases(value) {
  const matches = String(value ?? '').match(/[\u0531-\u058F]+(?:[ \t]+[\u0531-\u058F]+)*/gu) ?? []
  return [...new Set(matches.map((item) => item.trim()).filter(Boolean))].slice(0, 4)
}

export function appendTranslationTransliteration(answer, question, language = 'hyw') {
  const text = String(answer ?? '').trim()
  if (!text || language !== 'hyw' || !isTranslationRequest(question)) return text
  if (/\btransliteration\s*:/i.test(text)) return text

  const phrases = [...armenianPhrases(text), ...armenianPhrases(question)]
  const unique = [...new Set(phrases)]
  if (!unique.length) return text

  const transliterations = unique.map((phrase) => transliterateWesternArmenian(phrase))
  return `${text}\n\nTransliteration: ${transliterations.join(' / ')}`
}
