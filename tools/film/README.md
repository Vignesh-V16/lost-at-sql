# The intro film

`client/public/intro.mp4` is rendered from the fifteen illustrated panels in
`client/public/intro/` (`panel-01.jpg` … `panel-15.jpg`) — the official story
introduction, one panel per shot. It follows the brief in
`docs/intro-brief.md` with two changes: the brief's Temporal Core scene was
cut (its lettered art is kept in `originals/unused/`), and the CHRONOS
hand-off moved ahead of the mission, the case files and the clock, so it
lands right after the terminal its closing line points at.

The panels carry **no lettering**. The artwork's own captions, labels and
headers were inpainted away (`erase.py`; the lettered originals are kept in
`originals/`), and every line is typeset again — live, in the comic voices
of `client/src/components/intro/typeset.js` (impact lettering in Bangers
with an ink outline, cream caption plates, glowing HUD caps, phosphor
terminal type, a hand-written aside) and with comic entrances (slam, pop,
typewriter, word by word, glitch) — from `client/src/components/intro/fx.js`,
which the in-app pages and the film share. Change a word there and both
change.

- `panels.template.html` — the compositor: each panel on a blurred fill of
  itself under a still camera with a handheld sway, crossfades / hard cuts /
  glitch cuts, a knock on the impacts, the page's number and title in
  screen space, the lettering typeset in its boxes, artwork materialising
  in sequence, glows, light sweeps, HUD rings turning on the AI core, the vehicles crossing page 1's sky, flickering feeds, a
  drifting light leak, lens streaks on the bright sources, bokeh, motes and a
  scanline veil. `build-panels.mjs` inlines
  `fx.js` and `typeset.js` (the shared layout and camera maths) into it →
  `panels.html`.
- `render.mjs` — Playwright renders 1920×1080 frames at 30 fps into ffmpeg.
- `audio.py` — an optional soundtrack (`SOUND=1 bash render-all.sh`): a
  mood-following synth bed plus every sound event the shots schedule. The
  film is silent by default.
- `render-all.sh` — the whole pipeline: prepares the panels, checks the
  text fits, renders on `WORKERS` browsers (4 by default), encodes.
  A few minutes on eight cores.
- `erase.py` — inpaints every `erase` box, `header` strip and sprite `cut`
  out of `originals/` into `client/public/intro/`, with the surface's grain
  put back, and writes the small blurred `-bg.jpg` fill behind each panel.
  What a box may keep or restore:
  - `fill: true` fills from the colours around it, instead of inpainting
    (lettering inside a flat box); `patch` lays the texture of another box of
    the art over that fill (sky over page 1's erased date box).
  - `protect` boxes, `protectPoly` polygons and `protectAbove` (everything
    above a traced line of the art, following its own curve — the bezel and
    the face above page 8's screen) are never erased, and no later smoothing
    pass may reach into them.
  - `guard` polylines keep a line of the art that crosses the box. Give a few
    waypoints where it drifts; `guardWidth` is the band kept around it.
  - `redraw` draws a line back through an area that *was* erased: it traces
    the line's curve in the original, then lays that line's own cross-section
    along it, blended by its own strength, so it neither doubles nor dims.
    Use it when the line is uniform; `guard` it instead when its brightness
    varies along its length.
  - `shade: true` gives the fill the surface's real light and colour: its low
    frequencies are replaced by the original's, measured over the surface
    with the lettering excluded. Large fills otherwise invent a gradient and
    pull colour from whatever borders them.
  - `key` erases only the letters' own colours.
- `sprites.py` — cuts the `sprite` entries out of the originals with
  GrabCut → `client/public/intro/sprites/`.
- `boxes.mjs` — pictures for checking: every box drawn over the lettered
  original (`.cache/boxes-NN.jpg`), the end of every shot as the film shows
  it (`node boxes.mjs final` → `.cache/final-NN.jpg`), or one frame
  (`node boxes.mjs still 12.5 out.jpg`).
- `check-text.mjs` — measures every typeset line against its box with the
  real fonts; prints `all text fits` or lists the overflows (exit 1).
- `fx-json.mjs`, `launch.mjs` — the spec as JSON for the Python tools; the
  browser launcher (Playwright's Chromium, else Chrome or Edge on the
  machine; `BROWSER_CHANNEL=msedge` to choose).

Requirements: Node 20+ (`npm install` here brings Playwright and a bundled
ffmpeg; `npx playwright install chromium` for Playwright's own browser, or
have Chrome / Edge installed), Python 3 with numpy, scipy, Pillow and
opencv-python-headless. The fonts (Oswald, Dancing Script, JetBrains Mono)
load from Google Fonts, so the render needs the network.

## Working on the pages

```bash
cd tools/film
node boxes.mjs                 # are the erase / text boxes where the lettering is?
python sprites.py              # after changing a sprite's cut box
python erase.py                # after changing an erase / header / cut box → clean panels
node build-panels.mjs ../../client/src/components/intro/fx.js .cache/ panels.html
node check-text.mjs            # does every line fit?
node boxes.mjs final           # what the end of each shot looks like
bash render-all.sh             # the film
```

`erase.py` and `sprites.py` read the originals, so they can be re-run any
number of times. The pages in the app pick up `fx.js` and the clean panels
immediately; in development, `/intro-preview?page=7&paused=1` shows a page
on its own, without signing in.

## Replacing a panel

Drop the new lettered image at `originals/panel-NN.jpg` (3:2, at least
1200 px wide — 2048 px looks best; see `upscale/` for the 4× upscale the
current ones had), describe its lettering in `fx.js` (`header`, `erase` /
`fill` boxes, `text` entries with the same words), run `python erase.py NN`,
check with `node boxes.mjs` and `node boxes.mjs final`, then render.

## Shot timing

Shot lengths, cuts, moods, shakes (and the optional soundtrack's events) live in
`panels.template.html` (`SHOTS`) for the film and in
`client/src/components/intro/script.js` for the in-app pages — keep the two
in step. The lettering and the motion inside each slide are shared: `fx.js`
(boxes are fractions of the panel; times are seconds from the start of the
shot). The camera is still — only the handheld sway moves it.

Encode: H.264 `crf 26` (preset slow, high 4.1), a light film grain
(`noise c0s=2`) and vignette, no audio track (AAC 128 kbps with `SOUND=1`),
`+faststart`.
