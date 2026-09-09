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
test('Western Armenian suggestions transliterate all suggested words beyond four', () => {
  const answer = [
    'Here are 5 beginner Western Armenian food words:',
    '- \u0570\u0561\u0581 \u2014 bread',
    '- \u057B\u0578\u0582\u0580 \u2014 water',
    '- \u057A\u0561\u0576\u056B\u0580 \u2014 cheese',
    '- \u056D\u0576\u0571\u0578\u0580 \u2014 apple',
    '- \u056F\u0561\u0569 \u2014 milk',
  ].join('\n')

  assert.equal(
    appendWesternArmenianTransliterations(answer, 'hyw'),
    `${answer}\n\nTransliteration: hats' / chur / banir / khntsor / gat'`,
  )
})
