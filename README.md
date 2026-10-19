# Slitscanner 2.0 - web edition

An ordinary camera records the whole picture at once. A slit-scan camera
records only a thin line of the picture, the **slit**, again and again. It
lays each line beside the one before. The result is a picture of *time*
instead of a moment. Anything that stands still turns into streaks. Anything
that moves is stretched, squeezed or bent, depending on how fast it crosses
the slit.

Slitscanner does this live, from three sources: your **webcam**, a **video
file** from your computer, or a moving **test signal**. You can save the
picture at any moment as a full-size PNG image.

Everything happens inside your browser. Your camera picture and your video
files are never uploaded anywhere.

See it in action at <https://edmorais.github.io/Slitscanner-web/>

Remade using Claude Opus 5.5 from the original Slitscanner written in Processing (2013–2021):
<https://github.com/edmorais/Slitscanner>


---

## Contents

- [Getting started](#getting-started)
- [The screen at a glance](#the-screen-at-a-glance)
- [Choosing a source](#choosing-a-source)
- [Placing the slit](#placing-the-slit)
- [How the picture is made](#how-the-picture-is-made)
- [Pausing, pacing and clearing](#pausing-pacing-and-clearing)
- [Working with video files](#working-with-video-files)
- [Camera setup](#camera-setup)
- [Picture size and saving](#picture-size-and-saving)
- [Showing your work](#showing-your-work)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Ideas to try](#ideas-to-try)
- [Questions and answers](#questions-and-answers)

---

## Getting started

There are two ways to open Slitscanner:

- **The file.** Double-click `Slitscanner.html`. It opens in your browser,
  and every feature works, **including the camera**.
- **The web link.** Open the shared link in any modern browser. Video files,
  the test signal and saving all work. The camera does **not** work here,
  because the page that hosts the link doesn't allow web pages to use a
  camera. To use your webcam, open the file instead.

When Slitscanner opens, it fast-forwards the test signal for a few seconds.
This fills the screen with a finished slit-scan picture, so you can see the
idea straight away. Then it carries on scanning live.

**New to slit-scan?** Press the **?** key on the deck (or `F1`). A short
guided tour points at each part of the screen and explains it.

---

## The screen at a glance

Slitscanner looks like a piece of video equipment: a **monitor** standing on
a **control deck**.

**The monitor** shows the picture being built. On it you see:

- **The viewfinder**, a small inset in the corner. It shows the live source,
  with the slit drawn on it as a **red line**.
- **The on-screen display (OSD)**. Top left: the source and the scan
  settings. Top right: the scan time and how full the picture is. At the
  bottom, while a video file plays: its position, length and speed.
- **Two small amber arrows** at the top and bottom edges of the picture, in
  STATIC mode. They mark where the next slit will go.
- Under the screen, the **OUTPUT** keys (picture size) and two lamps. The red
  **TALLY** lamp is lit while Slitscanner is scanning.

**The deck** holds the controls, in labelled groups:

| Group | What it holds |
| --- | --- |
| Cassette slot | Load a video file; once loaded, it shows how far through the file you are |
| Snapshot | The green **SNAP** key, and the name the next saved picture will get |
| SOURCE | CAMERA, FILE, TEST SIGNAL, SETUP |
| Display window | The green-blue readout (see below) |
| TRANSPORT | STILL, SPEED, CLEAR |
| TAPE | Only while a video file is the source: REWIND, FRAME, RATE, LOOP |
| SCAN | MODE, DIRECTION, SLIT, WIDTH, POSITION |
| DISPLAY | VIEWFINDER, OSD, FULL, CLEAN, HELP |

**The display window** shows:

- a row of words that light up for what is on: **CAM**, **FILE** or **TEST**
  (the source), **STILL**, **SCROLL**, **ROW** and **MIR** (mirrored or
  flipped);
- the **scan time** in hours, minutes, seconds and frames. It only counts
  while the picture is being built;
- the **speed**, such as 1:1, and **FILL**, how much of the picture has been
  drawn since you last cleared it;
- a line of messages. **Point at any key with the mouse** and this line tells
  you what the key does and its keyboard shortcut.

Keys with a small light in the corner are switches: the light is on when the
switch is on.

**On different screens.** On a computer or a wide screen, the monitor fills
the left side and the deck is a column on the right. On a tablet, the monitor
sits above the deck. On a phone held upright, the monitor stays at the top of
the screen while you scroll through the deck below it. On a phone held
sideways, you get the computer arrangement.

---

## Choosing a source

The **SOURCE** keys choose what the slit reads.

| Key | Shortcut | Source |
| --- | --- | --- |
| **CAMERA** | `C` | Your webcam. The browser asks you to allow it the first time. |
| **FILE** | `L` | A video file from your computer. See [Working with video files](#working-with-video-files). |
| **TEST SIGNAL** | `T` | A moving test card that needs nothing else. |
| **SETUP** | `U` | Opens the setup panel for the current source. |

**The test signal** is a colourful test card at 30 frames a second. It has a
spinning wheel, a swinging ball, a running clock, and an amber line that rises
and falls inside the circle. With the slit in the middle, that amber line
draws a wave across the picture. It is a good way to learn what each control
does before you point a camera at anything.

Settings such as the slit position and mode stay the same when you change
source.

---

## Placing the slit

The slit is the line of the source that Slitscanner copies. Its position
changes the picture completely. You can move it in several ways:

- **Drag on the viewfinder.** The red line follows your finger or mouse.
- **Turn the mouse wheel** over the viewfinder to move it one step at a time.
- **POSITION ◂ ▸** on the deck moves it one pixel of the source. Hold a key
  to keep moving; after a moment it moves faster.
- **Arrow keys** `←` `→` (or `↑` `↓`) move it one pixel. With `Shift`, they
  move it a twentieth of the picture.

The label under POSITION shows where the slit is, in pixels of the source.

**Column or row.** The **SLIT** key (`A`) chooses what the slit reads:

- **SLIT COL** reads a **column**: an upright line of the source. This is
  the classic slit-scan.
- **SLIT ROW** reads a **row**: a level line of the source, stood on its end.
  On the viewfinder the red line is then level, and you drag it up and down.

**Width.** The **WIDTH** key (`W`) cycles through **×1, ×2, ×4 and ×8**. A
wider slit copies that many lines at a time. The picture fills faster, and
fine smears turn into broader bands.

---

## How the picture is made

**MODE** (`M`) switches between two ways of building the picture:

- **STATIC.** A write head sweeps across a still picture, laying down one slit
  after another, like a scanner. When it reaches the edge, it starts again from
  the other side and paints over the old picture. The amber arrows on the
  monitor show where it is.
- **SCROLL.** The whole picture moves along, and each new slit enters at the
  edge. It is like a strip of film running past: the newest moment is always
  at the edge, and the oldest slides off the other side.

**DIRECTION** (`D`) sets which way the picture goes, in both modes. With the
arrow pointing left, the sweep or the scroll moves to the left.

---

## Pausing, pacing and clearing

The **TRANSPORT** keys:

| Key | Shortcut | What it does |
| --- | --- | --- |
| **STILL** | `Space` | Freezes the picture. Press again to carry on. With a video file, it also pauses the video. |
| **SPEED ◂◂ ▸▸** | `Page Down` `Page Up` | Lays down one slit every so many frames, from **1:1** (every frame) to **1:100** (every hundredth frame). Hold a key to change it quickly. |
| **CLEAR** | `R` | Wipes the picture to black and resets the scan time. |

**Speed and time.** At 1:1, every frame of the source adds a slit. A slower
speed spreads a longer stretch of time across the same picture. Here is how
long one full sweep across a 16:9 picture takes, with a 30 frames a second
source:

| Width | Speed | One sweep takes |
| --- | --- | --- |
| ×8 | 1:1 | about 5 seconds |
| ×1 | 1:1 | about 43 seconds |
| ×1 | 1:10 | about 7 minutes |
| ×1 | 1:100 | about 71 minutes |

---

## Working with video files

**To load a video:**

- press **FILE** (or `L`) and choose a file; or
- click the **cassette slot** at the top of the deck; or
- **drag a video file** from your computer and drop it anywhere on the page.

Slitscanner plays the file and starts scanning it straight away. Most
browsers play **MP4** and **WebM** files; many also play **MOV**. If your
browser can't play a file, Slitscanner says so and goes back to the test
signal.

**Once a file is loaded:**

- **The cassette becomes the tape.** Its bar shows how far through the file
  you are. **Drag along it** to jump to any point. If you drag while
  scanning, the jump is recorded in the picture too.
- **The TAPE keys** appear on the deck:

| Key | Shortcut | What it does |
| --- | --- | --- |
| **REWIND** | `Home` | Goes back to the start of the file. |
| **FRAME ◂ ▸** | `,` `.` | Steps back or forward **one frame**, and lays down **exactly one slit**. This turns STILL on. Hold a key to step repeatedly. |
| **RATE** | `P` | Playback speed: ¼×, ½×, 1×, 2×, 4×. |
| **LOOP** | | When on, the file plays round and round. When off, Slitscanner stops at the end and turns STILL on; press STILL to play it again from the start. |

**Frame by frame.** With STILL on, the FRAME keys build the picture one frame
at a time. This gives you exact control, and every frame counts, however slow
your computer is.

**Slow computers.** Slitscanner adds one slit for each frame the browser
shows. If your computer can't keep up with a large video, it skips frames, and
the picture loses some slits. A slower **RATE**, such as ½×, gives it time to
show every frame.

**Changing source.** If you switch to the camera or the test signal, the file
stays loaded. Press **FILE** to go back to it. Press **FILE** again while it
plays to choose a different file.

Your video file is played from your computer. It is never uploaded, and
Slitscanner doesn't keep it: next time you open the page, load it again.

---

## Camera setup

Press **SETUP** (`U`) to open the setup panel. Press it again, or `Esc`, to
close it. What the panel shows depends on the source.

**For every source:**

- **MIRROR** flips the source left to right, like a mirror. Useful when you
  scan yourself with a webcam.
- **FLIP** turns the source upside down.

**For the camera:**

- **DEVICE**: one key for each camera on your computer (**CAM 1**, **CAM 2** …).
  Point at a key to see the camera's name.
- **REQUEST**: the picture size to ask the camera for: **480**, **720** or
  **1080** lines. The readout shows what you asked for and what the camera
  gave. Many cameras give a smaller size than you ask for.
- **Image controls**: a slider for each setting your camera lets the browser
  change, such as exposure, shutter, ISO, brightness, contrast, saturation,
  sharpness, white balance, focus and zoom. Which ones appear depends on the
  camera and the browser. Chrome and Edge show them for most webcams. Firefox
  and Safari show none.
  - Some sliders have an **AUTO** key. While AUTO is on, the camera sets that
    value itself. Moving the slider turns AUTO off.
  - **RESTORE** puts every setting back the way it was when the camera
    started.
  - **PROBE** asks the camera again which settings it has.

**For a video file**, the panel shows its name, size, length and frame rate.

**For the test signal**, the panel describes the test card.

Slitscanner remembers your camera, the picture size you asked for, and the
mirror and flip settings.

---

## Picture size and saving

**OUTPUT** keys under the monitor (or `1` `2` `3`) set the size of the
picture. It is always 720 pixels tall:

| Key | Size | Shape |
| --- | --- | --- |
| **4:3** | 960 × 720 | classic television |
| **16:9** | 1280 × 720 | widescreen (the default) |
| **2:1** | 1440 × 720 | extra wide |

A wider picture holds more time in one sweep. **Changing the output size
clears the picture**, so save it first if you want to keep it.

**To save the picture**, press the green **SNAP** key (or `S`). You get a
PNG image at the full output size, not the size it appears on your screen.
The screen flashes white when it saves.

Pictures are numbered: `slitscan_0001.png`, `slitscan_0002.png` and so on.
The window beside SNAP shows the name the next picture will get. The count
carries on the next time you open Slitscanner, so a new picture never
replaces an old one.

- **In the file**, pictures go to your browser's downloads folder.
- **On the web link**, you are asked to confirm each save. If you say no, the
  number is not used up.

---

## Showing your work

The **DISPLAY** keys:

| Key | Shortcut | What it does |
| --- | --- | --- |
| **VIEWFINDER** | `V` | Shows or hides the viewfinder inset. |
| **OSD** | `O` | Shows or hides the text on the monitor. |
| **FULL** | `F` | Fills your whole screen with the monitor. Press `F` or `Esc` to come back. |
| **CLEAN** | `H` | Shows the picture alone, filling the window, with no text, inset or controls. Good for projecting. Press `Esc`, `H`, or tap the picture to come back. |
| **HELP** | `F1` or `?` | Starts the guided tour. |

---

## Keyboard shortcuts

On a computer:

| Key | Action |
| --- | --- |
| `C` / `L` / `T` | Camera / video file / test signal |
| `U` or `Tab` | Open or close setup |
| `Space` | STILL on or off |
| `Page Up` / `Page Down` | Faster / slower |
| `R` | Clear the picture |
| `M` | STATIC or SCROLL |
| `D` | Change direction |
| `A` | Slit column or row |
| `W` | Slit width ×1, ×2, ×4, ×8 |
| `←` `→` (or `↑` `↓`) | Move the slit one pixel |
| `Shift` + arrow | Move the slit a twentieth of the picture |
| `1` `2` `3` | Output 4:3, 16:9, 2:1 |
| `S` | Save the picture |
| `Home` | Rewind the video file |
| `,` / `.` | One frame back / forward |
| `P` | Video playback rate |
| `V` / `O` | Viewfinder / on-screen text |
| `F` / `H` | Full screen / clean picture |
| `Esc` | Leave the clean picture, or close setup |
| `F1` or `?` | Guided tour (`←` `→` to move through it, `Esc` to close) |

---

## Ideas to try

- **Wave at the camera.** With the slit in the middle and STATIC mode, move
  your hand slowly through the slit, then quickly. A slow hand is stretched
  wide; a fast one is squeezed thin.
- **Turn your head.** Sit in front of the slit and turn your head slowly from
  side to side. Your face comes out melted and repeated.
- **Photo finish.** Point the camera at a street or a corridor and use SCROLL
  mode. Everything that crosses the slit is drawn as it passes, like the
  photo-finish camera at a race. Things that stand still become stripes.
- **Read a row.** Switch to SLIT ROW and put the slit across a moving scene:
  a dancer, traffic, waves. The picture turns sideways motion into shapes.
- **Spread out time.** Set the speed to 1:10 or slower and leave the camera
  looking out of a window. A whole afternoon of light and clouds fits into
  one picture.
- **Scan a film clip.** Load a video and step through it with FRAME, one
  slit per frame. Try a clip with a camera pan, then try MIRROR.
- **Make it wide.** Choose 2:1 output and ×1 width for long, detailed
  pictures; choose ×8 width for fast, blocky ones.

---

## Questions and answers

**I pressed CAMERA and nothing happened, or I got a message.**
Read the message on the monitor. The most common reasons:

- *This view can't open a camera*: you are using the web link. Open the
  `Slitscanner.html` file instead.
- *Camera blocked*: you said no when the browser asked, or the browser blocks
  cameras for this page. Allow the camera in the browser's site settings and
  press CAMERA again.
- *Camera busy*: another program, such as a video call, is using the camera.
  Close it and press CAMERA again.
- *No camera*: no camera was found. Plug one in and press CAMERA again.

**My video file won't play.**
Your browser can't decode that kind of file. Try an MP4 (H.264) or WebM
file. Chrome, Edge and Safari play MP4; most browsers play WebM.

**The picture is black.**
Press **CLEAR** and wait: in STATIC mode, the picture fills in as the write
head sweeps across. Check that STILL is off and the TALLY lamp is lit. At a
slow speed, such as 1:100, the picture fills very slowly.

**The picture is just stripes.**
Nothing is moving through the slit. Move the slit to where something moves,
or move something through it.

**Where did my picture go?**
In the file version, look in your browser's downloads folder for
`slitscan_` followed by a number.

**Will it remember my settings?**
Yes. Slitscanner remembers the mode, direction, slit, width, position, speed,
output size, display settings, camera choices and the snapshot count, in this
browser on this device. It doesn't remember your video file. A private or
incognito window forgets everything when you close it.

**The letters look different when I'm offline.**
Slitscanner loads its typefaces from the internet. Without a connection it
uses similar fonts that are already on your device. Everything else works the
same.

**Can I use it on a phone or tablet?**
Yes, with video files and the test signal. Every control is sized for
fingers, and the layout changes to fit the screen. The camera works only in
the file version, and phone browsers are less likely to open a camera from a
file.

---

*Slitscanner is by Eduardo Morais (www.eduardomorais.pt), after his
Processing sketch and its LÖVE version. For how the web version is built and
tested, see `DEVELOPERS.md`.*
