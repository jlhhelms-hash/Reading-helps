# Letter Sounds

A web app that checks whether elementary students know each letter's **name** and **sound**.

1. The first screen asks for the student's **first name, last name, grade and date of test** (the date starts as today). Ollie the Owl then welcomes them and shows their **star chart**.
2. The app shows a letter (big and small, like **Bb**), each letter in its own bright color.
3. **"What is the name of this letter?"** The student taps **🎤 Say it** and says the letter's name. If the app hears the right name, they earn a ⭐.
4. **"What is the sound of this letter?"** The student taps **🎤 Say it** and says the sound. If it's right, they earn another ⭐.
5. Each question gets 2 tries. If both answers are right, the student moves on to the next random letter.
6. If either is wrong, the app records a short video (5 seconds) of the student saying the letter and its sound, saved under their name for the teacher. Then the student does five practice activities for that letter:
   - **Listen and say it:** hear the letter and its sound, with pictures.
   - **Say it!:** tap **🎤 Say it** to film themselves saying the letter and its sound. The clip plays back so they hear themselves. They can redo it, and when they tap **Next** the last clip is saved for the teacher.
   - **Find the letter:** tap every big and small copy of the letter among look-alike letters.
   - **Pick the picture:** choose the picture that starts with the letter's sound.
   - **Trace it:** trace the big and small letter with a finger or mouse.
7. After practice, the student tries the letter again (and can earn its stars), then moves on.
8. At the end, they see how many stars they earned today and their total.

**Stars:** every right answer earns a star, so the total keeps growing. The star chart shows two stars for each letter: the first for its name and the second for its sound. A letter's stars stay on the chart once earned.

The **teacher page** (`/teacher`, protected by a PIN) shows each student's grade, last test date, star total, letters in color (passed, passed after practice, needs help, not tried yet), their videos (each marked **missed** or **practice**), and what the app heard on each try. Students are listed by last name.

**Excel export:** On the teacher page, **⬇ Export class to Excel** downloads one workbook for the whole class, sorted by last name. Each student's page has its own **⬇ Export to Excel** button, which downloads a file named like `Rodriguez, Maya - Letter Sounds.xlsx`. Each workbook has three sheets:

- **Summary:** last name, first name, grade, last test date, stars, letters passed first time, passed after practice, needs help, videos.
- **Letters A-Z:** one row per student (with grade), with each letter marked Passed (green), Practiced (yellow) or Help (red).
- **All tries:** every try, with grade, test date, time, whether the name and sound were right, and what the app heard.

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
