// Letter data and the logic that decides whether what the student said
// matches a letter's name or sound. Used by the browser app and the tests.
//
// Speech recognition writes down words, not sounds, so for each letter we
// list the spellings it tends to produce. `names` are the ways a letter's
// name gets written ("bee", "be", "b").
//
// Sounds follow S.P.I.R.E.: consonant sounds are clipped, with no added vowel,
// so /p/ counts but "puh", "pah" or "pit" do not. For a consonant, an answer
// counts only if it is made of nothing but the letter's own spellings
// (`soundStarts`), like "sss", "mmm" or "ck", or is in `sounds`. A clipped stop
// sound (/b/, /p/, /t/...) usually comes back from the browser as no words at
// all; the app then records it on video for the teacher. Vowel `sounds` are
// the short-vowel spellings the browser writes ("ah", "eh", "ih").

export const LETTERS = {
  A: { names: ['a', 'ay', 'hey', 'hay'], sounds: ['ah', 'aah', 'at', 'add', 'an', 'and'], soundStarts: [], words: [['apple', '🍎'], ['ant', '🐜'], ['alligator', '🐊']] },
  B: { names: ['b', 'bee', 'be', 'bea'], sounds: [], soundStarts: ['b'], words: [['ball', '⚽'], ['bear', '🐻'], ['banana', '🍌']] },
  C: { names: ['c', 'see', 'sea', 'si', 'cee'], sounds: ['ck'], soundStarts: ['c', 'k'], words: [['cat', '🐱'], ['car', '🚗'], ['cake', '🎂']] },
  D: { names: ['d', 'dee', 'de'], sounds: [], soundStarts: ['d'], words: [['dog', '🐶'], ['duck', '🦆'], ['door', '🚪']] },
  E: { names: ['e', 'ee', 'eee'], sounds: ['eh', 'ehh', 'ed', 'edd'], soundStarts: [], words: [['egg', '🥚'], ['elephant', '🐘'], ['elf', '🧝']] },
  F: { names: ['f', 'ef', 'eff'], sounds: ['ff'], soundStarts: ['f', 'ph'], words: [['fish', '🐟'], ['fox', '🦊'], ['frog', '🐸']] },
  G: { names: ['g', 'gee', 'ji', 'jee'], sounds: [], soundStarts: ['g'], words: [['goat', '🐐'], ['gift', '🎁'], ['grapes', '🍇']] },
  H: { names: ['h', 'aitch', 'haitch', 'ach', 'age', 'each'], sounds: ['hh'], soundStarts: ['h'], words: [['hat', '🎩'], ['horse', '🐴'], ['house', '🏠']] },
  I: { names: ['i', 'eye', 'aye', 'ai'], sounds: ['ih', 'it', 'in', 'is', 'if'], soundStarts: [], words: [['igloo', '🛖'], ['insect', '🐛'], ['ink', '🖋️']] },
  J: { names: ['j', 'jay', 'jae'], sounds: [], soundStarts: ['j'], words: [['jam', '🍓'], ['jet', '✈️'], ['juice', '🧃']] },
  K: { names: ['k', 'kay', 'okay', 'ok', 'cay'], sounds: ['ck'], soundStarts: ['k', 'c'], words: [['kite', '🪁'], ['key', '🔑'], ['king', '🤴']] },
  L: { names: ['l', 'el', 'ell', 'elle'], sounds: ['ll'], soundStarts: ['l'], words: [['lion', '🦁'], ['leaf', '🍃'], ['lemon', '🍋']] },
  M: { names: ['m', 'em'], sounds: ['mm', 'hmm'], soundStarts: ['m'], words: [['moon', '🌙'], ['monkey', '🐒'], ['milk', '🥛']] },
  N: { names: ['n', 'en'], sounds: ['nn'], soundStarts: ['n'], words: [['nest', '🪺'], ['nose', '👃'], ['nut', '🥜']] },
  O: { names: ['o', 'oh', 'owe'], sounds: ['ah', 'ahh', 'aw', 'awe', 'on', 'odd'], soundStarts: [], words: [['octopus', '🐙'], ['otter', '🦦'], ['olive', '🫒']] },
  P: { names: ['p', 'pee', 'pea'], sounds: [], soundStarts: ['p'], words: [['pig', '🐷'], ['pizza', '🍕'], ['pencil', '✏️']] },
  Q: { names: ['q', 'queue', 'cue', 'kew'], sounds: ['kw'], soundStarts: ['qu', 'kw'], words: [['queen', '👸'], ['quilt', '🛏️'], ['question', '❓']] },
  R: { names: ['r', 'are', 'ar', 'our'], sounds: ['rr'], soundStarts: ['r', 'wr'], words: [['rabbit', '🐰'], ['rainbow', '🌈'], ['robot', '🤖']] },
  S: { names: ['s', 'es', 'ess'], sounds: ['ss'], soundStarts: ['s'], words: [['sun', '☀️'], ['snake', '🐍'], ['sock', '🧦']] },
  T: { names: ['t', 'tee', 'tea', 'ti'], sounds: [], soundStarts: ['t'], words: [['tiger', '🐯'], ['tree', '🌳'], ['turtle', '🐢']] },
  U: { names: ['u', 'you', 'yu', 'ew'], sounds: ['uh', 'um', 'us'], soundStarts: [], words: [['umbrella', '☂️'], ['up', '⬆️'], ['upside down', '🙃']] },
  V: { names: ['v', 'vee', 've'], sounds: ['vv'], soundStarts: ['v'], words: [['van', '🚐'], ['violin', '🎻'], ['volcano', '🌋']] },
  W: { names: ['w', 'double u', 'double you', 'dub', 'dubya'], sounds: ['ww'], soundStarts: ['w'], words: [['whale', '🐋'], ['watch', '⌚'], ['worm', '🪱']] },
  X: { names: ['x', 'ex', 'ecks'], sounds: ['ks', 'kss', 'cks'], soundStarts: ['ks', 'x'], soundAtEnd: true, words: [['fox', '🦊'], ['box', '📦'], ['six', '6️⃣']] },
  Y: { names: ['y', 'why', 'wye', 'wy'], sounds: ['yy'], soundStarts: ['y'], words: [['yo-yo', '🪀'], ['yak', '🐃'], ['yarn', '🧶']] },
  Z: { names: ['z', 'zee', 'zed'], sounds: ['zz'], soundStarts: ['z'], words: [['zebra', '🦓'], ['zipper', '🤐'], ['zero', '0️⃣']] },
};

export const ALPHABET = Object.keys(LETTERS);

// S.P.I.R.E. key words: the program teaches each letter as name, key word, sound
// (for example "a, ax, /ă/"), with clipped sounds (/p/, not "puh"). These six
// are the ones confirmed from S.P.I.R.E.'s public materials; add the rest from
// your S.P.I.R.E. phonogram cards in the same form.
export const SPIRE_KEYS = {
  A: { word: 'ax', emoji: '🪓', sound: '/ă/' },
  E: { word: 'bed', emoji: '🛏️', sound: '/ĕ/' },
  I: { word: 'hit', emoji: '⚾', sound: '/ĭ/' },
  O: { word: 'ox', emoji: '🐂', sound: '/ŏ/' },
  U: { word: 'up', emoji: '⬆️', sound: '/ŭ/' },
  P: { word: 'pat', emoji: '🤚', sound: '/p/' },
};

// Lowercase, drop punctuation, and shorten stretched sounds ("sssss" -> "ss")
// so a long hiss and a short one compare the same.
export function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .replace(/-/g, ' ')
    .replace(/([a-z])\1{2,}/g, '$1$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function containsPhrase(text, phrase) {
  return ` ${text} `.includes(` ${normalize(phrase)} `);
}

// `heard` is the list of guesses the speech recognizer returned.
export function heardLetterName(letter, heard) {
  const { names } = LETTERS[letter];
  return heard.some((h) => names.some((n) => containsPhrase(normalize(h), n)));
}

export function heardLetterSound(letter, heard) {
  const { names, sounds, soundStarts } = LETTERS[letter];
  const nameWords = new Set(names.map(normalize));
  return heard.some((h) => {
    const text = normalize(h);
    if (sounds.some((s) => containsPhrase(text, s))) return true;
    if (!soundStarts.length) return false;
    // Clipped: the word is only the letter's own spellings repeated ("ss", "ck"),
    // with no vowel added, and it isn't the letter's name ("bee", "b").
    const clipped = new RegExp(`^(?:${soundStarts.join('|')})+$`);
    return text.split(' ').some((word) => !nameWords.has(word) && clipped.test(word));
  });
}

export function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
