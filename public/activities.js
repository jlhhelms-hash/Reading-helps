// Practice activities shown after a student misses a letter.
// Each activity draws itself into `box` and resolves when the student finishes.

import { LETTERS, ALPHABET, SPIRE_KEYS, shuffle } from './letters.js';
import { openCamera, recordClip, stopCamera, uploadClip } from './recorder.js';
import { confetti, letterColor, popTwinkle } from './fun.js';

const SAY_IT_SECONDS = 3;

// Letters that are easy to mix up, so "find the letter" is real practice.
const LOOKALIKES = {
  B: 'DPR', D: 'BPO', P: 'QBR', Q: 'OPG', M: 'NW', N: 'MHU', U: 'NV', W: 'MV',
  I: 'LJT', L: 'IT', J: 'IL', E: 'FB', F: 'ET', C: 'OG', G: 'CQ', O: 'CQ',
  V: 'UY', Y: 'VX', H: 'NK', K: 'XR', X: 'KY', Z: 'SN', S: 'ZC', T: 'FI', R: 'PB', A: 'HV',
};

// Letters whose sounds match, so they never appear as a "wrong" picture.
const SOUNDALIKES = { C: 'KQ', K: 'CQ', Q: 'CK', Y: 'U', U: 'Y' };

// Pick the most natural, child-like voice the device has. Edge on Windows has
// "Microsoft Ana", a child's voice; otherwise prefer the newer "Natural" voices.
const VOICE_PREFERENCES = [/\bAna\b/i, /Natural/i, /Google US English/i, /Samantha|Aria|Jenny|Ava\b/i, /Zira/i];
let chosenVoice;

function pickVoice() {
  const voices = speechSynthesis.getVoices().filter((v) => v.lang?.startsWith('en'));
  for (const pattern of VOICE_PREFERENCES) {
    const match = voices.find((v) => pattern.test(v.name) && v.lang === 'en-US') || voices.find((v) => pattern.test(v.name));
    if (match) return match;
  }
  return voices.find((v) => v.lang === 'en-US') || voices[0];
}

if ('speechSynthesis' in window) {
  speechSynthesis.addEventListener?.('voiceschanged', () => { chosenVoice = pickVoice(); });
}

export function speak(text) {
  if (!('speechSynthesis' in window)) return Promise.resolve();
  return new Promise((resolve) => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    chosenVoice ||= pickVoice();
    if (chosenVoice) u.voice = chosenVoice;
    // A child's voice is already high; raise the pitch of the others to sound younger and friendlier.
    const isChildVoice = /\bAna\b/i.test(chosenVoice?.name || '');
    u.pitch = isChildVoice ? 1.1 : 1.45;
    u.rate = 0.95;
    u.onend = resolve;
    u.onerror = resolve;
    // Some browsers never fire onend, so don't wait forever.
    setTimeout(resolve, 2000 + text.length * 90);
    speechSynthesis.speak(u);
  });
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

function soundHint(letter) {
  const { words, soundAtEnd } = LETTERS[letter];
  const list = words.map(([w]) => w).join(', ');
  return soundAtEnd
    ? `${letter} makes the sound at the end of ${list}.`
    : `${letter} makes the sound at the start of ${list}.`;
}

// 1. Hear the letter and its sound with pictures, then say it back.
function listenAndRepeat(box, letter) {
  return new Promise((resolve) => {
    const { words } = LETTERS[letter];
    const key = SPIRE_KEYS[letter];
    // With a S.P.I.R.E. key word, teach it the S.P.I.R.E. way: letter, key word, sound.
    const say = () => speak(key
      ? `${letter}. ${key.word}. Listen for the ${letter} sound in ${key.word}. Now you say the sound!`
      : `This is ${letter}. ${soundHint(letter)} Now you say it!`);
    box.replaceChildren(
      el('h2', {}, 'Listen and say it'),
      el('div', { class: 'letter-card small-card', style: `--letter-color: ${letterColor(letter)}` }, letter + letter.toLowerCase()),
      ...(key ? [el('div', { class: 'key-word' },
        el('span', { class: 'emoji' }, key.emoji),
        el('span', {}, `${letter.toLowerCase()} · ${key.word} · ${key.sound}`))] : []),
      el('div', { class: 'pictures' }, ...words.map(([w, emoji]) =>
        el('button', { class: 'picture', type: 'button', onclick: () => speak(w) }, el('span', { class: 'emoji' }, emoji), el('span', {}, w)))),
      el('p', { class: 'prompt' }, 'Say the sound 3 times, like the words.'),
      el('div', { class: 'row' },
        el('button', { class: 'big-btn', type: 'button', onclick: say }, '🔊 Hear it'),
        el('button', { class: 'big-btn ok', type: 'button', onclick: resolve }, 'I said it! ➜')),
    );
    say();
  });
}

// 2. Say it on camera, hear yourself, and save the clip for the teacher.
function sayIt(box, letter, { student, onStop }) {
  return new Promise((resolve) => {
    const video = el('video', { class: 'camera', autoplay: '', playsinline: '' });
    video.muted = true;
    const countdown = el('p', { class: 'countdown', 'aria-live': 'polite' });
    const status = el('p', { class: 'feedback', 'aria-live': 'polite' });
    const sayBtn = el('button', { class: 'say-btn', type: 'button' }, '🎤 Say it');
    const nextBtn = el('button', { class: 'big-btn ok', type: 'button', hidden: '' }, 'Next ➜');
    let stream = null;
    let clip = null;
    let clipUrl = null;

    // If the test is stopped while this activity is open, turn the camera off.
    onStop?.(() => stopCamera(stream));

    function finish() {
      stopCamera(stream);
      if (clipUrl) URL.revokeObjectURL(clipUrl);
      resolve();
    }

    async function showCamera() {
      video.src = '';
      video.srcObject = stream;
      video.classList.add('live');
      video.muted = true;
      video.controls = false;
      await video.play().catch(() => {});
    }

    sayBtn.addEventListener('click', async () => {
      popTwinkle();
      sayBtn.disabled = true;
      nextBtn.hidden = true;
      status.textContent = '';
      window.speechSynthesis?.cancel();
      await showCamera();
      clip = await recordClip(stream, SAY_IT_SECONDS, (text) => { countdown.textContent = text; });
      // Play it back so the student hears themselves.
      if (clipUrl) URL.revokeObjectURL(clipUrl);
      clipUrl = URL.createObjectURL(clip);
      video.srcObject = null;
      video.src = clipUrl;
      video.classList.remove('live');
      video.muted = false;
      video.controls = true;
      video.play().catch(() => {});
      status.textContent = 'Listen to you! 👂';
      sayBtn.textContent = '🎤 Say it again';
      sayBtn.disabled = false;
      nextBtn.hidden = false;
    });

    nextBtn.addEventListener('click', async () => {
      if (!clip) return finish();
      nextBtn.disabled = true;
      sayBtn.disabled = true;
      status.textContent = 'Saving…';
      try {
        await uploadClip(student, letter, 'practice', clip);
        status.textContent = 'Saved for your teacher! ⭐';
        confetti(30);
      } catch (err) {
        console.warn('Upload failed', err);
        status.textContent = "That didn't save, but great job!";
      }
      setTimeout(finish, 1200);
    });

    box.replaceChildren(
      el('h2', {}, 'Say it!'),
      el('p', { class: 'prompt' }, `Say "${letter}" and the sound ${letter} makes.`),
      video,
      countdown,
      el('div', { class: 'row' }, sayBtn, nextBtn),
      status,
    );

    openCamera().then((s) => {
      stream = s;
      showCamera();
      speak(`Tap say it. Then say ${letter}, and the sound ${letter} makes.`);
    }).catch((err) => {
      console.warn('Camera unavailable', err);
      video.remove();
      sayBtn.remove();
      status.textContent = "The camera isn't working. Say it out loud 3 times instead!";
      nextBtn.hidden = false;
      speak(`Say ${letter}, and the sound ${letter} makes, 3 times.`);
    });
  });
}

// 3. Tap every copy of the letter (big and small) among look-alikes.
function findTheLetter(box, letter) {
  return new Promise((resolve) => {
    const lookalikes = shuffle([...(LOOKALIKES[letter] || '')]);
    const decoys = [...new Set([...lookalikes, ...shuffle(ALPHABET)])].filter((l) => l !== letter);
    const targets = [letter, letter.toLowerCase(), letter, letter.toLowerCase()];
    const others = decoys.slice(0, 5).map((l) => (Math.random() < 0.5 ? l : l.toLowerCase()));
    let left = targets.length;
    const status = el('p', { class: 'feedback' }, `Find ${left} more.`);
    const tiles = shuffle([...targets, ...others]).map((ch) => {
      const tile = el('button', { class: 'tile', type: 'button' }, ch);
      tile.addEventListener('click', () => {
        if (tile.classList.contains('found')) return;
        if (ch.toUpperCase() === letter) {
          tile.classList.add('found');
          left--;
          status.textContent = left ? `Yes! Find ${left} more.` : 'You found them all! ⭐';
          if (!left) {
            confetti(40);
            setTimeout(resolve, 1400);
          }
        } else {
          tile.classList.remove('shake');
          void tile.offsetWidth;
          tile.classList.add('shake');
          status.textContent = `That one is ${ch}. Keep looking!`;
        }
      });
      return tile;
    });
    box.replaceChildren(
      el('h2', {}, `Tap every ${letter} and ${letter.toLowerCase()}`),
      el('div', { class: 'tiles' }, ...tiles),
      status,
    );
    speak(`Tap every ${letter}. Big and small.`);
  });
}

// 4. Pick the picture that has the letter's sound. Two rounds.
async function pickThePicture(box, letter) {
  const { words, soundAtEnd } = LETTERS[letter];
  const where = soundAtEnd ? 'ends' : 'starts';
  for (const [answer, answerEmoji] of shuffle(words).slice(0, 2)) {
    const wrong = shuffle(ALPHABET.filter((l) => l !== letter && l !== 'X' && !(SOUNDALIKES[letter] || '').includes(l)))
      .slice(0, 2).map((l) => shuffle(LETTERS[l].words)[0]);
    const choices = shuffle([[answer, answerEmoji], ...wrong]);
    await new Promise((resolve) => {
      const status = el('p', { class: 'feedback' });
      const question = `Which one ${where} with the ${letter} sound?`;
      box.replaceChildren(
        el('h2', {}, question),
        el('div', { class: 'pictures' }, ...choices.map(([w, emoji]) => {
          const btn = el('button', { class: 'picture', type: 'button' }, el('span', { class: 'emoji' }, emoji), el('span', {}, w));
          btn.addEventListener('click', async () => {
            if (w === answer) {
              btn.classList.add('found');
              status.textContent = `Yes! ${w} ${where} with ${letter}. ⭐`;
              confetti(30);
              await speak(`Yes! ${w}.`);
              setTimeout(resolve, 600);
            } else {
              btn.classList.add('shake');
              status.textContent = `${w} doesn't. Try again!`;
              speak(w);
            }
          });
          return btn;
        })),
        el('button', { class: 'big-btn', type: 'button', onclick: () => speak(question + ' ' + choices.map(([w]) => w).join(', ')) }, '🔊 Hear it'),
        status,
      );
      speak(question);
    });
  }
}

// 5. Trace the big and small letter with a finger or mouse.
function traceTheLetter(box, letter) {
  return new Promise((resolve) => {
    const canvas = el('canvas', { class: 'trace', width: '640', height: '360' });
    const done = el('button', { class: 'big-btn ok', type: 'button', disabled: '' }, 'Done ➜');
    const ctx = canvas.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    let inked = 0;
    let last = null;

    function drawGuide() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = '280px Andika, "Comic Sans MS", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = css.getPropertyValue('--trace-guide').trim() || '#ddd';
      ctx.fillText(letter + letter.toLowerCase(), canvas.width / 2, canvas.height / 2 + 10);
    }
    function point(e) {
      const r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) * (canvas.width / r.width), (e.clientY - r.top) * (canvas.height / r.height)];
    }
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); last = point(e); });
    canvas.addEventListener('pointermove', (e) => {
      if (!last) return;
      const p = point(e);
      const colorVar = letterColor(letter).slice(4, -1); // "var(--c3)" -> "--c3"
      ctx.strokeStyle = css.getPropertyValue(colorVar).trim() || '#2f6fed';
      ctx.lineWidth = 18;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(...last);
      ctx.lineTo(...p);
      ctx.stroke();
      inked += Math.hypot(p[0] - last[0], p[1] - last[1]);
      last = p;
      if (inked > 600) done.removeAttribute('disabled');
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => canvas.addEventListener(t, () => { last = null; }));
    done.addEventListener('click', resolve);

    box.replaceChildren(
      el('h2', {}, `Trace ${letter} and ${letter.toLowerCase()}`),
      canvas,
      el('div', { class: 'row' },
        el('button', { class: 'big-btn', type: 'button', onclick: () => { inked = 0; done.setAttribute('disabled', ''); drawGuide(); } }, '↺ Clear'),
        done),
    );
    document.fonts?.ready.then(drawGuide);
    drawGuide();
    speak(`Trace the letter ${letter} while you say its sound.`);
  });
}

export const ACTIVITIES = [listenAndRepeat, sayIt, findTheLetter, pickThePicture, traceTheLetter];
