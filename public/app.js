// Student app: show a letter, listen for its name and sound, and when the
// student misses, record a short video for the teacher and run practice.

import { ALPHABET, heardLetterName, heardLetterSound, shuffle } from './letters.js';
import { ACTIVITIES, speak } from './activities.js';
import { openCamera, recordClip, stopCamera, uploadClip } from './recorder.js';

const TRIES = 2;
const RECORD_SECONDS = 5;
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const $ = (id) => document.getElementById(id);
const state = { student: '', adultMode: !Recognition, practiced: [], passed: 0 };

function show(screen) {
  document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== `screen-${screen}`; });
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function nextClick(button) {
  return new Promise((resolve) => button.addEventListener('click', resolve, { once: true }));
}

// Listen until the student stops talking (or 7 seconds pass). Resolves with
// the recognizer's guesses: the whole thing first, then each piece's alternatives.
function listen() {
  return new Promise((resolve, reject) => {
    const rec = new Recognition();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 5;
    let pieces = [];
    let quiet;
    const hardStop = setTimeout(() => rec.stop(), 7000);
    rec.onresult = (e) => {
      pieces = [...e.results].map((result) => [...result].map((alt) => alt.transcript.trim()).filter(Boolean));
      // Stop once the student has been quiet for a moment.
      clearTimeout(quiet);
      quiet = setTimeout(() => rec.stop(), 1500);
    };
    rec.onerror = (e) => {
      clearTimeout(hardStop);
      clearTimeout(quiet);
      if (e.error === 'no-speech' || e.error === 'aborted') resolve([]);
      else reject(e.error);
    };
    rec.onend = () => {
      clearTimeout(hardStop);
      clearTimeout(quiet);
      const whole = pieces.map((alts) => alts[0]).filter(Boolean).join(' ');
      resolve(whole ? [whole, ...pieces.flat()] : []);
    };
    rec.start();
  });
}

function setFeedback(text, kind = '') {
  const f = $('feedback');
  f.textContent = text;
  f.className = `feedback ${kind}`;
}

function markStep(step, correct) {
  $(`step-${step}`).className = `step ${correct ? 'done' : 'missed'}`;
}

// Ask a grown-up to judge, for browsers without speech recognition.
async function adultCheck(letter) {
  $('say-btn').hidden = true;
  $('adult-check').hidden = false;
  const ask = async (question) => {
    $('adult-question').textContent = question;
    const yes = nextClick($('adult-yes')).then(() => true);
    const no = nextClick($('adult-no')).then(() => false);
    return Promise.race([yes, no]);
  };
  const name = await ask(`Grown-up: did they say the name "${letter}"?`);
  markStep('name', name);
  const sound = await ask(`Grown-up: did they say the ${letter} sound?`);
  markStep('sound', sound);
  $('adult-check').hidden = true;
  $('say-btn').hidden = false;
  return { name, sound, heard: '', checkedBy: 'adult' };
}

// The student taps "Say it" and says the letter's name and its sound together.
// Whatever they get right on any try counts. Returns { name, sound, heard, checkedBy }.
async function checkLetter(letter) {
  const got = { name: false, sound: false };
  const heardLog = [];
  $('prompt').textContent = 'Tap “Say it”. Say the letter and its sound.';
  speak('Say the name of this letter, and the sound it makes.');

  for (let tries = 0; tries < TRIES;) {
    if (state.adultMode) return adultCheck(letter);
    if (!tries) setFeedback('');
    await nextClick($('say-btn'));
    window.speechSynthesis?.cancel();
    $('say-btn').classList.add('listening');
    $('say-btn').textContent = '👂 Listening…';
    let heard;
    try {
      heard = await listen();
    } catch (err) {
      // No microphone permission or no speech service: let a grown-up check instead.
      console.warn('Speech recognition error:', err);
      state.adultMode = true;
      setFeedback("I can't hear right now. A grown-up can check.");
      continue;
    } finally {
      $('say-btn').classList.remove('listening');
      $('say-btn').textContent = '🎤 Say it';
    }
    if (!heard.length) {
      setFeedback("I didn't hear you. Tap “Say it” and try again!");
      continue;
    }
    heardLog.push(heard[0]);
    got.name ||= heardLetterName(letter, heard);
    got.sound ||= heardLetterSound(letter, heard);
    if (got.name) markStep('name', true);
    if (got.sound) markStep('sound', true);
    if (got.name && got.sound) break;

    tries++;
    if (tries >= TRIES) break;
    if (got.name) {
      setFeedback(`Yes, that's ${letter}! Now tap “Say it” and say its sound.`, 'oops');
      $('prompt').textContent = `What sound does ${letter} make?`;
    } else if (got.sound) {
      setFeedback('Good sound! Now tap “Say it” and say the letter’s name.', 'oops');
      $('prompt').textContent = 'What is this letter’s name?';
    } else {
      setFeedback(`I heard "${heard[0]}". Try one more time!`, 'oops');
    }
  }
  if (!got.name) markStep('name', false);
  if (!got.sound) markStep('sound', false);
  return { ...got, heard: heardLog.join(' / '), checkedBy: 'app' };
}

async function saveAttempt(record) {
  try {
    await fetch('api/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ student: state.student, ...record }),
    });
  } catch (err) {
    console.warn('Could not save result', err);
  }
}

// Test one letter. Returns true when both the name and the sound were right.
async function testLetter(letter, retry) {
  show('letter');
  $('letter-upper').textContent = letter;
  $('letter-lower').textContent = letter.toLowerCase();
  $('letter-card').classList.remove('pass');
  ['name', 'sound'].forEach((s) => { $(`step-${s}`).className = 'step'; });

  const result = await checkLetter(letter);
  await saveAttempt({
    letter, retry, nameCorrect: result.name, soundCorrect: result.sound,
    heard: result.heard, checkedBy: result.checkedBy,
  });

  const passed = result.name && result.sound;
  if (passed) {
    $('letter-card').classList.add('pass');
    setFeedback('You did it! 🎉', 'yay');
    await speak('Great job!');
    await wait(800);
  } else {
    setFeedback(`This letter is ${letter}. Let's practice it together!`, 'oops');
    await speak(`This letter is ${letter}. Let's practice it together!`);
    await wait(800);
  }
  return passed;
}

// Record the student saying the letter and sound, and save it for the teacher.
async function recordVideo(letter) {
  show('record');
  $('record-prompt').textContent = `Press the button, then say "${letter}" and the sound ${letter} makes.`;
  $('record-status').textContent = '';
  $('countdown').textContent = '';
  const button = $('record-btn');
  button.hidden = false;
  button.disabled = false;

  let stream;
  try {
    stream = await openCamera();
  } catch (err) {
    console.warn('Camera unavailable', err);
    $('record-status').textContent = "The camera isn't working, so let's go practice!";
    button.hidden = true;
    await wait(2500);
    return;
  }
  $('camera').srcObject = stream;
  speak(`Let's record you saying ${letter} and its sound for your teacher.`);
  await nextClick(button);
  button.disabled = true;

  const clip = await recordClip(stream, RECORD_SECONDS, (text) => { $('countdown').textContent = text; });
  stopCamera(stream);
  $('camera').srcObject = null;

  $('record-status').textContent = 'Saving…';
  try {
    await uploadClip(state.student, letter, 'missed', clip);
    $('record-status').textContent = 'Saved for your teacher! ⭐';
  } catch (err) {
    console.warn('Upload failed', err);
    $('record-status').textContent = "That didn't save, but that's OK. Let's practice!";
  }
  button.hidden = true;
  await wait(2000);
}

async function practice(letter) {
  show('practice');
  $('practice-letter').textContent = letter + letter.toLowerCase();
  for (const [i, activity] of ACTIVITIES.entries()) {
    $('practice-step').textContent = `${i + 1} of ${ACTIVITIES.length}`;
    await activity($('activity'), letter, { student: state.student });
  }
}

async function run(count) {
  state.practiced = [];
  state.passed = 0;
  const letters = shuffle(ALPHABET).slice(0, count);
  $('who').textContent = `👋 ${state.student}`;
  for (const [i, letter] of letters.entries()) {
    $('progress').textContent = `${i + 1} / ${letters.length}`;
    if (await testLetter(letter, false)) {
      state.passed++;
      continue;
    }
    state.practiced.push(letter);
    await recordVideo(letter);
    await practice(letter);
    // One more try after practice, then move on either way.
    if (await testLetter(letter, true)) state.passed++;
  }
  show('done');
  const practiced = state.practiced.length ? ` You practiced: ${state.practiced.join(', ')}.` : '';
  $('done-summary').textContent = `You got ${state.passed} of ${letters.length} letters!${practiced}`;
  speak('Great job!');
}

$('start-form').addEventListener('submit', (e) => {
  e.preventDefault();
  state.student = $('student-name').value.replace(/\s+/g, ' ').trim();
  if (!state.student) return;
  run(Number($('letter-count').value));
});

$('again-btn').addEventListener('click', () => run(Number($('letter-count').value)));

show('start');
