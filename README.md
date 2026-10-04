# Letter Sounds

A web app that checks whether elementary students know each letter's **name** and **sound**.

1. The student types their first and last name. Ollie the Owl welcomes them and shows their **star chart**: one gold star for each letter they have mastered, kept from visit to visit.
2. The app shows a letter (big and small, like **Bb**), with each letter in its own bright color.
3. The student taps **🎤 Say it** and says the letter's name and its sound together ("B… buh"). If they only get one part right, the app asks for the other part. They get 2 tries, and a part they got right on either try counts.
4. If both are right, the student earns a ⭐ for that letter (with confetti and a chime) and moves on to the next random letter. A letter's star is earned once and is never taken away.
5. If either is wrong, the app records a short video (5 seconds) of the student saying the letter and its sound. The video is saved under the student's name for the teacher.
6. The student then does five practice activities for that letter:
   - **Listen and say it:** hear the letter and its sound, with pictures.
   - **Say it!:** tap **🎤 Say it** to film themselves saying the letter and its sound. The clip plays back so they hear themselves. They can redo it, and when they tap **Next** the last clip is saved for the teacher.
   - **Find the letter:** tap every big and small copy of the letter among look-alike letters.
   - **Pick the picture:** choose the picture that starts with the letter's sound.
   - **Trace it:** trace the big and small letter with a finger or mouse.
7. After practice, the student tries the letter one more time and can still earn its star, then moves on.
8. At the end, the star chart sparkles to show the new stars earned today.

The **teacher page** (`/teacher`, protected by a PIN) shows each student's letters in color (passed, passed after practice, needs help, not tried yet), their videos (each marked **missed** or **practice**), and what the app heard on each try. Students are listed by last name.

**Excel export:** On the teacher page, **⬇ Export class to Excel** downloads one workbook for the whole class, sorted by last name. Each student's page has its own **⬇ Export to Excel** button, which downloads a file named like `Rodriguez, Maya - Letter Sounds.xlsx`. Each workbook has three sheets:

- **Summary:** last name, first name, stars, letters passed first time, passed after practice, needs help, videos, last active.
- **Letters A-Z:** one row per student, with each letter marked Passed (green), Practiced (yellow) or Help (red).
- **All tries:** every try, with the date, whether the name and sound were right, and what the app heard.

## Run it on your computer

You need [Node.js](https://nodejs.org) version 20 or newer. There's nothing else to install.

```bash
node server.js
```

Then open:

- Students: http://localhost:3000
- Teacher: http://localhost:3000/teacher (the PIN is `1234` unless you change it)

To pick your own PIN:

```bash
TEACHER_PIN=8642 node server.js
```

Use **Chrome**, **Edge** or **Safari**. The first time, the browser asks to use the microphone and camera. Click **Allow**.

## Good to know

- **Speech checking is a helper, not a judge.** Browsers turn speech into words, so a bare sound like "/b/" can come out as "buh," "bah" or "but." The app accepts the usual spellings for each sound (see `public/letters.js`). The teacher page shows what it heard so you can spot letters it gets wrong. In browsers without speech recognition (such as Firefox), or if the microphone is blocked, a grown-up gets **✓ Yes / ✗ Not yet** buttons instead.
- **Speech recognition in Chrome needs the internet.** Chrome sends the audio to Google to turn it into words.
- **Camera and microphone only work on `localhost` or an `https://` address.** Running on one classroom computer works as-is. Letting student devices across the school network connect needs HTTPS hosting.
- **Student videos are private data.** They are saved only on the computer running the app, in `data/students/<name>/videos/` (missed-letter clips are named like `B-<time>.webm`, practice clips like `B-practice-<time>.webm`). That folder is never uploaded to GitHub (see `.gitignore`). Check your school or district's rules for recording students before you use this with a class.
- Students are kept apart by first and last name, so they need to type their name the same way each time to keep their stars.

## For developers

```bash
npm test        # letter-matching and server tests
```

| File | What it does |
| --- | --- |
| `server.js` | Small web server with no packages to install: saves results and videos, runs the teacher login |
| `public/letters.js` | Letter data and the name/sound matching rules |
| `public/app.js` | Student flow: test, record, practice, retry |
| `public/activities.js` | The five practice activities |
| `public/recorder.js` | Camera recording and video upload |
| `public/fun.js` | Letter colors, confetti, the star chime, flying stars and the star chart |
| `xlsx.js` | Small Excel file writer used by the teacher export |
| `public/teacher.html`, `public/teacher.js` | Teacher page |
| `data/` | Student results and videos (created when the app runs, not saved to GitHub) |
