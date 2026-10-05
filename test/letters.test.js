import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LETTERS, ALPHABET, heardLetterName, heardLetterSound, normalize } from '../public/letters.js';

test('every letter has names, a way to match its sound, and three picture words', () => {
  assert.equal(ALPHABET.length, 26);
  for (const letter of ALPHABET) {
    const l = LETTERS[letter];
    assert.ok(l.names.length && (l.sounds.length || l.soundStarts.length), letter);
    assert.equal(l.words.length, 3, letter);
  }
});

test('normalize shortens stretched sounds and drops punctuation', () => {
  assert.equal(normalize('Sssssss!'), 'ss');
  assert.equal(normalize('B.'), 'b');
  assert.equal(normalize('Double-U'), 'double u');
});

test('letter names are recognized from common transcripts', () => {
  assert.ok(heardLetterName('B', ['bee']));
  assert.ok(heardLetterName('B', ['B']));
  assert.ok(heardLetterName('C', ['see']));
  assert.ok(heardLetterName('W', ['double you']));
  assert.ok(heardLetterName('H', ['it is aitch']));
  assert.ok(heardLetterName('Q', ['dog', 'queue']), 'checks every alternative');
});

test('wrong letter names are rejected', () => {
  assert.ok(!heardLetterName('B', ['dee']));
  assert.ok(!heardLetterName('M', ['en']));
  assert.ok(!heardLetterName('P', ['queue']));
  assert.ok(!heardLetterName('A', ['banana']), 'does not match inside words');
});

test('clipped consonant sounds are recognized', () => {
  assert.ok(heardLetterSound('S', ['sssssss']));
  assert.ok(heardLetterSound('M', ['mmmm']));
  assert.ok(heardLetterSound('M', ['hmm']));
  assert.ok(heardLetterSound('F', ['fff']));
  assert.ok(heardLetterSound('C', ['ck']));
  assert.ok(heardLetterSound('K', ['ck']));
  assert.ok(heardLetterSound('X', ['ks']));
  assert.ok(heardLetterSound('Z', ['zzz']));
  assert.ok(heardLetterSound('B', ['bb']), 'a repeated clipped b');
});

test('consonant sounds with an added vowel ("puh") are not accepted', () => {
  for (const [letter, said] of [['P', 'puh'], ['B', 'buh'], ['T', 'tuh'], ['D', 'dah'], ['C', 'kuh'], ['K', 'kuh'],
    ['G', 'guh'], ['S', 'suh'], ['M', 'muh'], ['B', 'bih'], ['P', 'pop'], ['B', 'but'], ['Q', 'quick']]) {
    assert.ok(!heardLetterSound(letter, [said]), `${letter}: "${said}"`);
  }
});

test('short vowel sounds are recognized', () => {
  assert.ok(heardLetterSound('A', ['ah']));
  assert.ok(heardLetterSound('E', ['eh']));
  assert.ok(heardLetterSound('I', ['ih']));
  assert.ok(heardLetterSound('O', ['aw']));
  assert.ok(heardLetterSound('U', ['uh']));
});

test('saying the name or the key word is not the sound', () => {
  assert.ok(!heardLetterSound('B', ['bee']));
  assert.ok(!heardLetterSound('B', ['b']));
  assert.ok(!heardLetterSound('T', ['tea']));
  assert.ok(!heardLetterSound('E', ['e']));
  assert.ok(!heardLetterSound('A', ['ax']));
  assert.ok(!heardLetterSound('U', ['up']));
});

test('wrong sounds are rejected', () => {
  assert.ok(!heardLetterSound('B', ['dd']));
  assert.ok(!heardLetterSound('M', ['nnn']));
  assert.ok(!heardLetterSound('F', ['vvv']));
  assert.ok(!heardLetterSound('B', ['banana']));
});
