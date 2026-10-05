// Celebrations: letter colors, confetti, a happy chime, flying stars and the star chart.

import { ALPHABET } from './letters.js';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Each letter gets one of six crayon colors (see --c0 ... --c5 in style.css).
export function letterColor(letter) {
  return `var(--c${ALPHABET.indexOf(letter.toUpperCase()) % 6})`;
}

export function confetti(amount = 80) {
  if (reducedMotion()) return;
  const layer = document.createElement('div');
  layer.className = 'confetti';
  for (let i = 0; i < amount; i++) {
    const bit = document.createElement('i');
    bit.style.left = `${Math.random() * 100}%`;
    bit.style.background = `var(--c${i % 6})`;
    bit.style.animationDelay = `${Math.random() * 0.4}s`;
    bit.style.animationDuration = `${1.6 + Math.random() * 1.2}s`;
    bit.style.setProperty('--drift', `${(Math.random() - 0.5) * 200}px`);
    bit.style.setProperty('--spin', `${Math.random() * 720}deg`);
    layer.append(bit);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 3200);
}

let audio;
// A short rising "ding-ding-ding" for earning a star.
export function chime() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const start = audio.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const t = start + i * 0.09;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      osc.connect(gain).connect(audio.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    });
  } catch {
    // No sound is fine.
  }
}

// A bubbly "pop" and a quick twinkle, played when the student taps Say it.
export function popTwinkle() {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const start = audio.currentTime;
    const note = (type, from, to, at, length, volume) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, at);
      osc.frequency.exponentialRampToValueAtTime(to, at + length * 0.6);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(volume, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
      osc.connect(gain).connect(audio.destination);
      osc.start(at);
      osc.stop(at + length + 0.02);
    };
    note('sine', 380, 1100, start, 0.09, 0.35); // pop
    [1760, 2349, 2794, 3520].forEach((freq, i) => note('triangle', freq, freq, start + 0.07 + i * 0.045, 0.16, 0.08)); // twinkle
  } catch {
    // No sound is fine.
  }
}

// A big star pops up over `from`, then flies into `to` (the star counter).
export function flyStar(from, to) {
  return new Promise((resolve) => {
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const star = document.createElement('div');
    star.className = 'flying-star';
    star.textContent = '⭐';
    star.style.left = `${a.left + a.width / 2}px`;
    star.style.top = `${a.top + a.height / 2}px`;
    document.body.append(star);
    if (reducedMotion()) {
      setTimeout(() => { star.remove(); resolve(); }, 600);
      return;
    }
    const dx = b.left + b.width / 2 - (a.left + a.width / 2);
    const dy = b.top + b.height / 2 - (a.top + a.height / 2);
    star.animate([
      { transform: 'translate(-50%, -50%) scale(0.2) rotate(0deg)', opacity: 0 },
      { transform: 'translate(-50%, -50%) scale(2.4) rotate(20deg)', opacity: 1, offset: 0.3 },
      { transform: 'translate(-50%, -50%) scale(2.2) rotate(-10deg)', opacity: 1, offset: 0.55 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.6) rotate(360deg)`, opacity: 1 },
    ], { duration: 900, easing: 'cubic-bezier(.5,0,.3,1)' }).finished.then(() => {
      star.remove();
      to.classList.remove('bump');
      void to.offsetWidth;
      to.classList.add('bump');
      resolve();
    });
  });
}

// A–Z chart. `chart` is { B: { name: true, sound: false }, ... }: each letter shows
// two stars, the first for its name and the second for its sound (the chart doesn't
// say which is which). `fresh` letters sparkle.
export function renderStarChart(box, chart, fresh = []) {
  box.replaceChildren(...ALPHABET.map((letter) => {
    const { name = false, sound = false } = chart[letter] || {};
    const cell = document.createElement('div');
    const level = name && sound ? ' earned' : name || sound ? ' half' : '';
    cell.className = `chart-cell${level}${fresh.includes(letter) ? ' fresh' : ''}`;
    const stars = document.createElement('span');
    stars.className = 'chart-stars';
    for (const got of [name, sound]) {
      const star = document.createElement('span');
      star.textContent = '⭐';
      if (!got) star.className = 'empty';
      stars.append(star);
    }
    const label = document.createElement('span');
    label.textContent = letter + letter.toLowerCase();
    cell.append(stars, label);
    if (name || sound) cell.style.setProperty('--letter-color', letterColor(letter));
    const count = Number(name) + Number(sound);
    cell.title = `${letter}: ${count} ${count === 1 ? 'star' : 'stars'}`;
    return cell;
  }));
}
