import test from 'node:test'
import assert from 'node:assert/strict'
import {
  appendTranslationTransliteration,
  appendWesternArmenianTransliterations,
  transliterateWesternArmenian,
} from '../supabase/functions/armenian-chat/transliteration.js'

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

test('Western pronunciation mapping follows Tun rules for բ as p', () => {
  assert.equal(transliterateWesternArmenian('բարեւ'), 'parev')
})

test('Western Armenian suggestions receive deterministic transliteration even when not asked as a translation', () => {
  assert.equal(
    appendWesternArmenianTransliterations(
      'You could also practice Բարեւ and Շնորհակալութիւն.',
      'hyw',
    ),
    "You could also practice Բարեւ and Շնորհակալութիւն.\n\nTransliteration: Parev / Shnorhagalut'ivn",
  )
})

test('Eastern answers are not processed by Western transliteration rules', () => {
  assert.equal(
    appendWesternArmenianTransliterations('Try Բարեւ.', 'hye'),
    'Try Բարեւ.',
  )
})