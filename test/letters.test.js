import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LETTERS, ALPHABET, heardLetterName, heardLetterSound, normalize } from '../public/letters.js';

test('every letter has names, sounds and three picture words', () => {
  assert.equal(ALPHABET.length, 26);
  for (const letter of ALPHABET) {
    const l = LETTERS[letter];
    assert.ok(l.names.length && l.sounds.length, letter);
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

test('letter sounds are recognized', () => {
  assert.ok(heardLetterSound('B', ['buh']));
  assert.ok(heardLetterSound('B', ['bih']), 'short word starting with the letter');
  assert.ok(heardLetterSound('S', ['sssssss']));
  assert.ok(heardLetterSound('M', ['mmmm']));
  assert.ok(heardLetterSound('C', ['kuh']));
  assert.ok(heardLetterSound('A', ['ah']));
  assert.ok(heardLetterSound('B', ['bee buh']), 'name then sound in one go');
});

test('name and sound said together in one go', () => {
  for (const [letter, said] of [['B', 'bee buh'], ['S', 'es sss'], ['M', 'em mmm'], ['A', 'a ah'], ['T', 'T tuh']]) {
    assert.ok(heardLetterName(letter, [said]), `${letter} name in "${said}"`);
    assert.ok(heardLetterSound(letter, [said]), `${letter} sound in "${said}"`);
  }
  assert.ok(!heardLetterSound('B', ['bee bee']), 'name twice is not the sound');
});

test('saying the name is not the sound', () => {
  assert.ok(!heardLetterSound('B', ['bee']));
  assert.ok(!heardLetterSound('B', ['b']));
  assert.ok(!heardLetterSound('T', ['tea']));
  assert.ok(!heardLetterSound('E', ['e']));
});

test('wrong sounds are rejected', () => {
  assert.ok(!heardLetterSound('B', ['duh']));
  assert.ok(!heardLetterSound('M', ['nnn']));
  assert.ok(!heardLetterSound('F', ['vuh']));
  assert.ok(!heardLetterSound('B', ['banana']), 'long words do not count');
});
