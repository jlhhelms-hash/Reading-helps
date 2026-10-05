// Letter data and the logic that decides whether what the student said
// matches a letter's name or sound. Used by the browser app and the tests.
//
// Speech recognition writes down words, not sounds, so for each letter we
// list the spellings it tends to produce. `names` are the ways a letter's
// name gets written ("bee", "be", "b"). `sounds` are the ways its sound gets
// written ("buh", "bah"). `soundStarts` lets short made-up words such as
// "bih" count as the B sound too.

export const LETTERS = {
  A: { names: ['a', 'ay', 'hey', 'hay'], sounds: ['ah', 'aah', 'at', 'add', 'an', 'and', 'ask', 'apple'], soundStarts: [], words: [['apple', '🍎'], ['ant', '🐜'], ['alligator', '🐊']] },
  B: { names: ['b', 'bee', 'be', 'bea'], sounds: ['buh', 'bah', 'ba', 'bu', 'but', 'bud', 'bug'], soundStarts: ['b'], words: [['ball', '⚽'], ['bear', '🐻'], ['banana', '🍌']] },
  C: { names: ['c', 'see', 'sea', 'si', 'cee'], sounds: ['kuh', 'cuh', 'ka', 'ca', 'cut', 'cup', 'kah', 'ck', 'ku', 'cu', 'coo', 'cook', 'kick', 'cuz'], soundStarts: ['c', 'k'], words: [['cat', '🐱'], ['car', '🚗'], ['cake', '🎂']] },
  D: { names: ['d', 'dee', 'de'], sounds: ['duh', 'da', 'dah', 'du', 'dud', 'done'], soundStarts: ['d'], words: [['dog', '🐶'], ['duck', '🦆'], ['door', '🚪']] },
  E: { names: ['e', 'ee', 'eee'], sounds: ['eh', 'ehh', 'ed', 'egg', 'edd', 'end'], soundStarts: [], words: [['egg', '🥚'], ['elephant', '🐘'], ['elf', '🧝']] },
  F: { names: ['f', 'ef', 'eff'], sounds: ['ff', 'fuh', 'fa', 'fu', 'fun', 'fah'], soundStarts: ['f', 'ph'], words: [['fish', '🐟'], ['fox', '🦊'], ['frog', '🐸']] },
  G: { names: ['g', 'gee', 'ji', 'jee'], sounds: ['guh', 'ga', 'gah', 'gu', 'gut', 'gum'], soundStarts: ['g'], words: [['goat', '🐐'], ['gift', '🎁'], ['grapes', '🍇']] },
  H: { names: ['h', 'aitch', 'haitch', 'ach', 'age', 'each'], sounds: ['huh', 'ha', 'hah', 'hu', 'hut', 'hum'], soundStarts: ['h'], words: [['hat', '🎩'], ['horse', '🐴'], ['house', '🏠']] },
  I: { names: ['i', 'eye', 'aye', 'ai'], sounds: ['ih', 'it', 'in', 'is', 'if', 'ick', 'itch'], soundStarts: [], words: [['igloo', '🛖'], ['insect', '🐛'], ['ink', '🖋️']] },
  J: { names: ['j', 'jay', 'jae'], sounds: ['juh', 'ja', 'jah', 'ju', 'jug', 'just'], soundStarts: ['j'], words: [['jam', '🍓'], ['jet', '✈️'], ['juice', '🧃']] },
  K: { names: ['k', 'kay', 'okay', 'ok', 'cay'], sounds: ['kuh', 'ka', 'kah', 'cuh', 'ca', 'cut', 'cup', 'ck', 'ku', 'cu', 'coo', 'cook', 'kick', 'cuz'], soundStarts: ['k', 'c'], words: [['kite', '🪁'], ['key', '🔑'], ['king', '🤴']] },
  L: { names: ['l', 'el', 'ell', 'elle'], sounds: ['ll', 'la', 'luh', 'lah', 'lu', 'luv'], soundStarts: ['l'], words: [['lion', '🦁'], ['leaf', '🍃'], ['lemon', '🍋']] },
  M: { names: ['m', 'em'], sounds: ['mm', 'muh', 'ma', 'mah', 'mom', 'mum', 'mud', 'hmm'], soundStarts: ['m'], words: [['moon', '🌙'], ['monkey', '🐒'], ['milk', '🥛']] },
  N: { names: ['n', 'en'], sounds: ['nn', 'nuh', 'na', 'nah', 'nut', 'nun'], soundStarts: ['n'], words: [['nest', '🪺'], ['nose', '👃'], ['nut', '🥜']] },
  O: { names: ['o', 'oh', 'owe'], sounds: ['ah', 'ahh', 'aw', 'ox', 'on', 'odd', 'awe', 'ott'], soundStarts: [], words: [['octopus', '🐙'], ['otter', '🦦'], ['olive', '🫒']] },
  P: { names: ['p', 'pee', 'pea'], sounds: ['puh', 'pa', 'pah', 'pu', 'pup', 'put', 'pop'], soundStarts: ['p'], words: [['pig', '🐷'], ['pizza', '🍕'], ['pencil', '✏️']] },
  Q: { names: ['q', 'queue', 'cue', 'kew'], sounds: ['kwuh', 'kwa', 'kwah', 'qua', 'quack', 'quick', 'quit'], soundStarts: ['qu', 'kw'], words: [['queen', '👸'], ['quilt', '🛏️'], ['question', '❓']] },
  R: { names: ['r', 'are', 'ar', 'our'], sounds: ['rr', 'ruh', 'ra', 'rah', 'run', 'rub', 'err'], soundStarts: ['r', 'wr'], words: [['rabbit', '🐰'], ['rainbow', '🌈'], ['robot', '🤖']] },
  S: { names: ['s', 'es', 'ess'], sounds: ['ss', 'suh', 'sa', 'sah', 'sun', 'sub', 'sis'], soundStarts: ['s'], words: [['sun', '☀️'], ['snake', '🐍'], ['sock', '🧦']] },
  T: { names: ['t', 'tee', 'tea', 'ti'], sounds: ['tuh', 'ta', 'tah', 'tu', 'tub', 'tut', 'top'], soundStarts: ['t'], words: [['tiger', '🐯'], ['tree', '🌳'], ['turtle', '🐢']] },
  U: { names: ['u', 'you', 'yu', 'ew'], sounds: ['uh', 'up', 'um', 'us', 'huh', 'under'], soundStarts: [], words: [['umbrella', '☂️'], ['up', '⬆️'], ['upside down', '🙃']] },
  V: { names: ['v', 'vee', 've'], sounds: ['vv', 'vuh', 'va', 'vah', 'van', 'vu'], soundStarts: ['v'], words: [['van', '🚐'], ['violin', '🎻'], ['volcano', '🌋']] },
  W: { names: ['w', 'double u', 'double you', 'dub', 'dubya'], sounds: ['wuh', 'wa', 'wah', 'wu', 'what', 'was', 'won', 'one'], soundStarts: ['w'], words: [['whale', '🐋'], ['watch', '⌚'], ['worm', '🪱']] },
  X: { names: ['x', 'ex', 'ecks'], sounds: ['ks', 'kss', 'ekss', 'cks', 'x ray'], soundStarts: [], soundAtEnd: true, words: [['fox', '🦊'], ['box', '📦'], ['six', '6️⃣']] },
  Y: { names: ['y', 'why', 'wye', 'wy'], sounds: ['yuh', 'ya', 'yah', 'yum', 'yes', 'yuck', 'yup'], soundStarts: ['y'], words: [['yo-yo', '🪀'], ['yak', '🐃'], ['yarn', '🧶']] },
  Z: { names: ['z', 'zee', 'zed'], sounds: ['zz', 'zuh', 'za', 'zah', 'zoo', 'zip', 'zu'], soundStarts: ['z'], words: [['zebra', '🦓'], ['zipper', '🤐'], ['zero', '0️⃣']] },
};

export const ALPHABET = Object.keys(LETTERS);

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
    // A short word that starts with the letter (like "bih" for B) counts,
    // but saying the letter's name ("bee") does not.
    return text.split(' ').some((word) =>
      word.length >= 1 && word.length <= 4 && !nameWords.has(word) &&
      soundStarts.some((start) => word.startsWith(start)));
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
