# Slitscanner - web edition

Slitscanner is tool for slit-scan photography, complete with the ability to switch between webcam (if available) and video file input, a GUI with a broadcast monitor on a DVCAM-style deck, a VFD, viewfinder, setup panel and a guided tour.

See it in action at <https://edmorais.github.io/Slitscanner-web/>

Remade using Claude Opus 5.5 from the original Slitscanner written in Processing (2013–2021):
<https://github.com/edmorais/Slitscanner>

## Keyboard

| Control | What it does |
| --- | --- |
| MODE `M` | STATIC sweeps a write head over a still picture; SCROLL moves the picture and new slits enter at the edge |
| DIRECTION `D` | which way the picture goes, in both modes |
| SLIT `A` | read a column, or a row stood on its end (first row at the band's right edge, its left end at the top) |
| WIDTH `W` | 1, 2, 4 or 8 lines per step, centred on the slit and kept inside the frame |
| SPEED `PgUp` `PgDn` | one slit every N source frames, 1:1 to 1:100; held keys repeat |
| POSITION `←` `→` (`Shift` ×20) | move the slit; or drag or scroll on the viewfinder |
| STILL `Space` | freeze the scan (and pause a file) |
| CLEAR `R` | wipe the picture, reset the timecode |
| OUTPUT `1` `2` `3` | 960, 1280 or 1440 × 720 (4:3, 16:9, 2:1) |
| SNAP `S` | full-size PNG, numbered `slitscan_0001.png` onwards; the count persists, so names never repeat |
| SETUP `U` / `Tab` | mirror, flip; for a camera: device, requested resolution (480/720/1080), and the image controls the browser reports, with AUTO, RESTORE and PROBE |
| VF `V`, OSD `O`, HELP `F1` `?` | viewfinder inset, on-screen display, ten-step tour |

The VFD shows source lamps, the scan timecode, the speed as 1:N and FILL %.
Pointing at a key puts its job and shortcut on the VFD's bottom line. All
settings are saved in the browser and range-checked on load.

## New in the web version

- **Video files.** FILE `L`, the cassette, or drop a video anywhere on the
  page. Once loaded, the cassette is the tape: drag along it to scrub. The
  TAPE keys appear while a file is the source: REWIND `Home`, FRAME `,` `.`
  (each step lays down exactly one slit), RATE `P` (¼× to 4×) and LOOP. With
  loop off, the end of the tape turns STILL on. FILE returns to an
  already-loaded file without the picker.
- **One slit per real frame.** Camera and file frames arrive through
  `requestVideoFrameCallback`, so a 30 fps source lays 30 slits a second
  however fast the screen refreshes. The file's frame length is measured from
  the media timestamps and shown in SETUP. Browsers without the callback
  sample a file on a 30 fps grid of its own clock, and a camera on the
  decoder's frame count.
- **Camera image controls.** The setup panel builds a fader for each control
  the camera reports through `getCapabilities()`: exposure, shutter, ISO,
  brightness, contrast, saturation, sharpness, white balance, focus and zoom.
  Touching a fader turns its AUTO off.
- **Pre-roll.** On opening, the test signal is fast-forwarded through one full
  sweep (under 4 s), so the first view is a finished picture, not a black
  screen. The test card gained an amber line that rises and falls inside the
  circle, which a column slit draws as a sine wave.
- **FULL** `F` (fullscreen monitor) and **CLEAN** `H` (the picture alone, for
  projecting; `Esc` or a tap returns).

## Responsive layout

| Window | Arrangement |
| --- | --- |
| wide (≥ 940 px and wider than 1.22:1), or a phone on its side | monitor on the left, sized to the full height; the deck is a column on the right that scrolls inside itself |
| tablet or narrow desktop | monitor over deck, as in Videolab; the monitor is sized so monitor and deck fit the window where they can |
| phone upright | the monitor sticks to the top while the deck scrolls under it; keys become an even grid with 40 px touch height |

The screen always takes the output's aspect (4:3, 16:9 or 2:1).

## Files

    src/app.html  src/app.css  src/app.js   markup, styles, scanner
    build.py                       inlines them into dist/Slitscanner.html (artifact)
                                   and dist/Slitscanner-standalone.html (opens from disk)
    test/suite.py                  Playwright suite (sections can run alone)
    test/shot.py                   one screenshot at a given size
    test/media/                    generated test videos (VP9, VP8, H.264) and a text file
    test/fonts.css                 the four typefaces inlined, served in place of Google Fonts

## Tests

    python3 build.py && python3 test/suite.py      # or: suite.py engine file keys ...

**577 checks, all passing**, in headless Chromium with Chromium's fake camera:

- **engine (70):** pixel reads of the picture for every width × direction ×
  axis. They check which source columns or rows land where, that the band
  runs top to bottom, and that nothing is written beside it. Also: scroll
  shifts, sweep wrap, FILL counting, edge clamping, mirror, output sizes,
  SPEED pacing, STILL.
- **camera (18):** fake camera scans; 480 request restarts at 640×480; device
  list; faders from stubbed capabilities; AUTO off on touch; RESTORE; blocked
  permission message.
- **files (30):** size and measured 1/30 s frame length; ~1 slit per frame;
  five frame steps lay five slits and move five frames; rate, rewind,
  cassette scrub to 75 %, end of tape, switching away and back; portrait 9:16
  viewfinder; refusal of a non-video and of an undecodable file; drop.
- **keys (73):** every key and every shortcut against its state, hold-repeat,
  viewfinder drag/wheel for columns and rows, clean feed, labels, VFD hints.
- **snapshots (9):** real downloads are full-size PNGs with the right
  numbering, which survives a reload; through a stand-in for the artifact's
  save dialog, a declined save says so and doesn't use up a number.
- **layout (310):** 14 window sizes from 360×640 to 2560×1440, each with and
  without the setup panel and in all three outputs: no sideways scroll, no
  control outside the window, no overlapping keys or captions, screen at the
  output's aspect, the side arrangement fits without scrolling, and the setup
  panel opens below a sticky monitor.
- **help (44), persist (15), no-rVFC (6), fuzz (2):** every tour step rings
  its target without covering it. Settings survive a reload, hostile stored
  values fall back to defaults, and the page runs with storage blocked. The
  polling path works. 600 random clicks, keys, resizes, drags and scrubs ran
  without an error or a broken invariant.


