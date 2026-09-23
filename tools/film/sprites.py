"""
Cuts the sprites out of the lettered originals.

Every `sprite` entry in client/src/components/intro/fx.js names a cut-out
(`src`) and the box it comes from on the original panel (`cut`). This
lifts each one off its background with GrabCut, feathers the edge and
writes a transparent PNG to client/public/intro/sprites/ — the vehicles
that cross page 1's sky. erase.py removes the same boxes from the art, so
each vehicle appears once, moving.

    python sprites.py
"""
import json
import os
import subprocess

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ORIG = os.path.join(HERE, 'originals')
OUT = os.path.join(HERE, '..', '..', 'client', 'public', 'intro', 'sprites')
os.makedirs(OUT, exist_ok=True)

spec = json.loads(subprocess.check_output(['node', os.path.join(HERE, 'fx-json.mjs')], text=True))
FX = spec['FX']
MARGIN = 10

for key, entries in FX.items():
    n = int(key[-2:])
    img = None
    for f in entries:
        if f['type'] != 'sprite' or not f.get('cut'):
            continue
        if img is None:
            img = cv2.imread(os.path.join(ORIG, f'panel-{n:02d}.jpg'))
        h, w = img.shape[:2]
        x, y, bw, bh = f['cut']
        x0, y0 = max(0, int(x * w) - MARGIN), max(0, int(y * h) - MARGIN)
        x1, y1 = min(w, int((x + bw) * w) + MARGIN), min(h, int((y + bh) * h) + MARGIN)
        crop = img[y0:y1, x0:x1].copy()
        mask = np.zeros(crop.shape[:2], np.uint8)
        bgd = np.zeros((1, 65), np.float64)
        fgd = np.zeros((1, 65), np.float64)
        rectangle = (MARGIN, MARGIN, crop.shape[1] - 2 * MARGIN, crop.shape[0] - 2 * MARGIN)
        cv2.grabCut(crop, mask, rectangle, bgd, fgd, 6, cv2.GC_INIT_WITH_RECT)
        alpha = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
        # keep the largest blob (the vehicle), drop specks of sky
        num, labels, stats, _ = cv2.connectedComponentsWithStats(alpha, 8)
        if num > 1:
            biggest = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
            keep = np.isin(labels, [i for i in range(1, num) if stats[i, cv2.CC_STAT_AREA] >= 0.12 * stats[biggest, cv2.CC_STAT_AREA]])
            alpha = np.where(keep, 255, 0).astype(np.uint8)
        alpha = cv2.morphologyEx(alpha, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        alpha = cv2.GaussianBlur(alpha, (0, 0), 1.2)
        ys, xs = np.where(alpha > 12)
        if len(xs) == 0:
            print(f'{f["src"]}: nothing found in the cut box — check fx.js')
            continue
        bx0, bx1, by0, by1 = max(0, xs.min() - 2), min(alpha.shape[1], xs.max() + 3), max(0, ys.min() - 2), min(alpha.shape[0], ys.max() + 3)
        rgba = cv2.cvtColor(crop[by0:by1, bx0:bx1], cv2.COLOR_BGR2BGRA)
        rgba[:, :, 3] = alpha[by0:by1, bx0:bx1]
        cv2.imwrite(os.path.join(OUT, f['src']), rgba)
        print(f'{f["src"]}: {rgba.shape[1]}x{rgba.shape[0]} from panel-{n:02d} {f["cut"]}')
print('done -> client/public/intro/sprites/')
