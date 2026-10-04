// Student app: show a letter, listen for its name and sound, and when the
// student misses, record a short video for the teacher and run practice.

import { ALPHABET, heardLetterName, heardLetterSound, shuffle } from './letters.js';
import { ACTIVITIES, speak } from './activities.js';

const TRIES_PER_STEP = 2;
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

// Listen once. Resolves with the recognizer's guesses (may be empty).
function listen() {
  return new Promise((resolve, reject) => {
    const rec = new Recognition();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 5;
    const heard = [];
    const timer = setTimeout(() => rec.stop(), 6000);
    rec.onresult = (e) => {
      for (const result of e.results) for (const alt of result) heard.push(alt.transcript);
    };
    rec.onerror = (e) => { clearTimeout(timer); e.error === 'no-speech' ? resolve([]) : reject(e.error); };
    rec.onend = () => { clearTimeout(timer); resolve(heard); };
    rec.start();
  });
}

function setFeedback(text, kind = '') {
  const f = $('feedback');
  f.textContent = text;
  f.className = `feedback ${kind}`;
}

// Ask a grown-up to judge, for browsers without speech recognition.
async function adultCheck() {
  $('mic-btn').hidden = true;
  $('adult-check').hidden = false;
  const yes = nextClick($('adult-yes')).then(() => true);
  const no = nextClick($('adult-no')).then(() => false);
  const correct = await Promise.race([yes, no]);
  $('adult-check').hidden = true;
  $('mic-btn').hidden = false;
  return { correct, heard: '', checkedBy: 'adult' };
}

// One step: the letter's name or its sound. Returns { correct, heard, checkedBy }.
async function checkStep(letter, step) {
  const check = step === 'name' ? heardLetterName : heardLetterSound;
  const ask = step === 'name' ? 'What is the name of this letter?' : 'What sound does this letter make?';
  $('prompt').textContent = ask;
  $(`step-${step}`).classList.add('active');
  speak(ask);

  const allHeard = [];
  for (let tries = 0; tries < TRIES_PER_STEP;) {
    if (state.adultMode) return adultCheck();
    setFeedback(tries ? 'Try one more time. Tap the microphone.' : 'Tap the microphone, then talk.');
    await nextClick($('mic-btn'));
    window.speechSynthesis?.cancel();
    $('mic-btn').classList.add('listening');
    setFeedback('Listening…');
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
      $('mic-btn').classList.remove('listening');
    }
    if (!heard.length) {
      setFeedback("I didn't hear you. Let's try again!");
      await wait(1200);
      continue;
    }
    allHeard.push(heard[0]);
    if (check(letter, heard)) return { correct: true, heard: allHeard.join(' / '), checkedBy: 'app' };
    tries++;
    setFeedback(`I heard "${heard[0]}".`, 'oops');
    await wait(1500);
  }
  return { correct: false, heard: allHeard.join(' / '), checkedBy: 'app' };
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
  ['name', 'sound'].forEach((s) => $(`step-${s}`).className = 'step');

  const name = await checkStep(letter, 'name');
  $('step-name').classList.add(name.correct ? 'done' : 'missed');
  if (name.correct) {
    setFeedback(`Yes! That's ${letter}! ⭐`, 'yay');
  } else {
    setFeedback(`This letter is ${letter}.`, 'oops');
    await speak(`This letter is ${letter}.`);
  }
  await wait(1000);

  const sound = await checkStep(letter, 'sound');
  $('step-sound').classList.add(sound.correct ? 'done' : 'missed');

  await saveAttempt({
    letter, retry, nameCorrect: name.correct, soundCorrect: sound.correct,
    heardName: name.heard, heardSound: sound.heard,
    checkedBy: name.checkedBy === 'adult' || sound.checkedBy === 'adult' ? 'adult' : 'app',
  });

  const passed = name.correct && sound.correct;
  if (passed) {
    $('letter-card').classList.add('pass');
    setFeedback('You did it! 🎉', 'yay');
    await speak('Great job!');
    await wait(800);
  } else {
    setFeedback(sound.correct ? 'Good sound! Let\'s practice the name.' : 'Let\'s practice this one together.', 'oops');
    await wait(1500);
  }
  return passed;
}

function pickMimeType() {
  const options = ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  return options.find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
}

// Record the student saying the sound and upload it for the teacher.
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
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: true });
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

  for (const n of [3, 2, 1]) {
    $('countdown').textContent = n;
    await wait(800);
  }
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => { recorder.onstop = r; });
  recorder.start();
  for (let s = RECORD_SECONDS; s > 0; s--) {
    $('countdown').textContent = `🔴 Say it now! ${s}`;
    await wait(1000);
  }
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  $('camera').srcObject = null;
  $('countdown').textContent = '';

  const type = (recorder.mimeType || mimeType || 'video/webm').split(';')[0];
  $('record-status').textContent = 'Saving…';
  try {
    const res = await fetch(`api/recordings?student=${encodeURIComponent(state.student)}&letter=${letter}`, {
      method: 'POST', headers: { 'Content-Type': type }, body: new Blob(chunks, { type }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
    await activity($('activity'), letter);
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
