import test from 'node:test'
import assert from 'node:assert/strict'
import { appendTranslationTransliteration } from '../supabase/functions/armenian-chat/transliteration.js'

test('Western translation replaces model-generated transliteration with deterministic Tun transliteration', () => {
  assert.equal(
    appendTranslationTransliteration(
      "Դուն ի՞նչ կ’ընես։\n\nTransliteration: Inch' g / ënes.",
      'Translate “What are you doing?” into Western Armenian.',
      'hyw',
    ),
    "Դուն ի՞նչ կ’ընես։\n\nTransliteration: Tun inch' g'ënes?",
  )
})

test('Western transliteration keeps Armenian emphasis mark elision in one phrase', () => {
  assert.equal(
    appendTranslationTransliteration(
      "Ի՞նչ կ՛ընես։\n\nTransliteration: Inch' g / ënes.",
      'Translate “What are you doing?” into Western Armenian.',
      'hyw',
    ),
    "Ի՞նչ կ՛ընես։\n\nTransliteration: Inch' g'ënes?",
  )
})
