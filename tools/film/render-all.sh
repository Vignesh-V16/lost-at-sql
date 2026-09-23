#!/bin/bash
# Renders client/public/intro.mp4 from the fifteen clean panels in
# client/public/intro/ and the spec in client/src/components/intro/fx.js:
# the lettering typeset live, sway, cuts, glitches, leaks, streaks, bokeh,
# the synthesised soundtrack. Needs node 20+, playwright + chromium, ffmpeg
# (or the ffmpeg-static package), and python 3 with numpy, scipy, Pillow.
#   bash render-all.sh            WORKERS=4 by default (one Chromium each)
set -e
cd "$(dirname "$0")"
FPS=30
WORKERS=${WORKERS:-4}
# python 3: $PYTHON, else the first of python3 / python / py that actually runs
# (on Windows, `python3` may be the Store's placeholder, which only prints a message)
if [ -z "$PYTHON" ]; then for c in python3 python py; do if "$c" -c "import sys" >/dev/null 2>&1; then PYTHON=$c; break; fi; done; fi
PY=${PYTHON:?no python 3 found}
export FFMPEG=${FFMPEG:-$(node -p "try{require('ffmpeg-static')}catch{ 'ffmpeg' }")}
mkdir -p .cache
"$PY" - <<'PY'
from PIL import Image, ImageFilter, ImageEnhance
import glob, os
for f in sorted(glob.glob('../../client/public/intro/panel-??.jpg')):
    im = Image.open(f).convert('RGB')
    name = os.path.basename(f)
    if im.width < 1900:
        im = im.resize((1920, round(1920 * im.height / im.width)), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.6, percent=60, threshold=2))
    im.save('.cache/' + name, quality=92, subsampling=0)
    bg = im.resize((640, round(640 * im.height / im.width)), Image.LANCZOS).filter(ImageFilter.GaussianBlur(14))
    ImageEnhance.Brightness(bg).enhance(0.55).save('.cache/' + name.replace('.jpg', '-bg.jpg'), quality=80)
print('panels prepared')
PY
node build-panels.mjs ../../client/src/components/intro/fx.js .cache/ panels.html
node check-text.mjs
export FILM_PAGE=panels.html
node render.mjs probe.mp4 0 0.1 $FPS 0.5 > /dev/null   # writes film-info.json
TOTAL=$("$PY" -c "import json;print(json.load(open('film-info.json'))['TOTAL'])")
N=$("$PY" -c "print(round($TOTAL*$FPS))")
echo "total $TOTAL s · $N frames · $WORKERS workers"
PIDS=()
for ((i=0; i<WORKERS; i++)); do
  A=$("$PY" -c "print(($N*$i//$WORKERS)/$FPS)")
  B=$("$PY" -c "print(($N*($i+1)//$WORKERS)/$FPS)")
  node render.mjs part$i.mp4 $A $B $FPS 1.2 &
  PIDS+=($!)
done
for pid in "${PIDS[@]}"; do wait "$pid" || { echo "a render worker failed (pid $pid)"; exit 1; }; done
# the concat list is written only once every worker is done, so a run that is
# stopped part way cannot delete the list a later run is still building
rm -f parts.txt
for ((i=0; i<WORKERS; i++)); do
  [ -s part$i.mp4 ] || { echo "part$i.mp4 is missing or empty"; exit 1; }
  printf "file 'part%d.mp4'\n" $i >> parts.txt
done
"$FFMPEG" -y -loglevel error -f concat -safe 0 -i parts.txt -c copy video-raw.mp4
VIDEO_FILTER="[0:v]noise=c0s=2:c0f=t+u,vignette=angle=PI/5:mode=forward[v]"
if [ "${SOUND:-0}" = "1" ]; then
  # SOUND=1 adds the synthesised soundtrack (audio.py); the intro is silent by default
  "$PY" audio.py
  "$FFMPEG" -y -loglevel error -i video-raw.mp4 -i soundtrack.wav -filter_complex "$VIDEO_FILTER" -map "[v]" -map 1:a -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -profile:v high -level 4.1 -c:a aac -b:a 128k -shortest -movflags +faststart ../../client/public/intro.mp4
else
  "$FFMPEG" -y -loglevel error -i video-raw.mp4 -filter_complex "$VIDEO_FILTER" -map "[v]" -an -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -profile:v high -level 4.1 -movflags +faststart ../../client/public/intro.mp4
fi
rm -f part*.mp4 parts.txt probe.mp4 video-raw.mp4 soundtrack.wav
echo "done → client/public/intro.mp4"
