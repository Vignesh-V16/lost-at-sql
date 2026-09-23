"""
Erases the baked-in lettering from the panels.

Reads the `erase` boxes, the `header` strips and the sprite `cut` boxes of
every panel from client/src/components/intro/fx.js, inpaints those regions
out of the lettered originals in tools/film/originals/, and writes the
clean panels to client/public/intro/ (with a small blurred `-bg.jpg` each,
the fill behind the panel) — where the pages and the film typeset the same
words again, live. Re-run it whenever a box changes.

    python erase.py            # every panel in the spec
    python erase.py 3 11       # just these

Small regions (a caption inside a flat box) are inpainted at full size;
large ones (a header strip over the art) at a quarter of the size and
blended back, with the seam smoothed at full size — a soft fill that the
header drawn over it hides completely. An entry with `fill: true` is filled
from the colours around it instead (gradients carry through); `protect`,
`protectPoly` and `protectAbove` keep part of the box untouched. Masks land in .cache/erase-NN.png.
"""
import json
import os
import subprocess
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ORIG = os.path.join(HERE, 'originals')
OUT = os.path.join(HERE, '..', '..', 'client', 'public', 'intro')
CACHE = os.path.join(HERE, '.cache')
os.makedirs(CACHE, exist_ok=True)

spec = json.loads(subprocess.check_output(['node', os.path.join(HERE, 'fx-json.mjs')], text=True))
FX = spec['FX']
LARGE = 40_000  # px² — above this, inpaint coarsely


def regions(entries):
    """(box, kind, fill) for everything that must leave the art."""
    for f in entries:
        if f['type'] in ('erase', 'header'):
            yield f['box'], f['type'], f.get('fill') if f.get('fill') == 'rows' else bool(f.get('fill')), f.get('patch'), float(f.get('tone', 0)), f
        elif f['type'] == 'sprite' and f.get('cut'):
            yield f['cut'], 'sprite', False, None, 0, f


def rect(box, w, h, pad):
    x, y, bw, bh = box
    x0 = max(0, int(round(x * w)) - pad)
    y0 = max(0, int(round(y * h)) - pad)
    x1 = min(w, int(round((x + bw) * w)) + pad)
    y1 = min(h, int(round((y + bh) * h)) + pad)
    return x0, y0, x1, y1


def rim_fill(img, x0, y0, x1, y1, gap=3):
    """
    Fills the box from the colours just outside it: every pixel is the
    inverse-distance blend of the rim pixel above, below, left and right of
    it, so gradients and lighting across the box carry straight through
    (a flat median would leave a visible patch).
    """
    h, w = img.shape[:2]
    H, W = y1 - y0, x1 - x0
    smooth = lambda line: cv2.GaussianBlur(line.reshape(1, -1, 3).astype(np.float32), (0, 0), 4).reshape(-1, 3)
    top = smooth(img[max(0, y0 - gap), x0:x1])
    bottom = smooth(img[min(h - 1, y1 + gap - 1), x0:x1])
    left = smooth(img[y0:y1, max(0, x0 - gap)])
    right = smooth(img[y0:y1, min(w - 1, x1 + gap - 1)])
    i = np.arange(H, dtype=np.float32)[:, None, None]
    j = np.arange(W, dtype=np.float32)[None, :, None]
    wt, wb, wl, wr = 1 / (i + 1), 1 / (H - i), 1 / (j + 1), 1 / (W - j)
    v = (top[None, :, :] * wt + bottom[None, :, :] * wb + left[:, None, :] * wl + right[:, None, :] * wr) / (wt + wb + wl + wr)
    return np.clip(v, 0, 255).astype(np.uint8)


def with_grain(img, x0, y0, x1, y1, ring=8):
    """
    Puts grain back on a smooth fill: noise with the amplitude and softness
    of the fine detail in the ring just outside the box — never a copy of
    anything, so no neighbouring lettering or art can leak in.
    """
    h, w = img.shape[:2]
    X0, Y0, X1, Y1 = max(0, x0 - ring), max(0, y0 - ring), min(w, x1 + ring), min(h, y1 + ring)
    patch = img[Y0:Y1, X0:X1].astype(np.float32)
    hp = patch - cv2.GaussianBlur(patch, (0, 0), 2.5)
    keep = np.ones(patch.shape[:2], bool)
    keep[(y0 - Y0):(y1 - Y0), (x0 - X0):(x1 - X0)] = False
    std = hp[keep].std(axis=0) if keep.any() else np.zeros(3)
    std = np.minimum(std, 6.0)  # edges and ink lines in the ring must not turn into heavy noise
    rng = np.random.default_rng(x0 * 7 + y0 * 13)
    noise = rng.normal(0, 1, (y1 - y0, x1 - x0, 3)).astype(np.float32)
    noise = cv2.GaussianBlur(noise, (0, 0), 0.8) * std[None, None, :] * 1.6
    return np.clip(img[y0:y1, x0:x1].astype(np.float32) + noise, 0, 255).astype(np.uint8)


def textured(img, original, x0, y0, x1, y1, src, tone=0.0):
    """
    Lays the texture of another region of the original (`patch`: a box in
    panel fractions, mirrored top to bottom) over a filled box — screen over
    screen, sky over sky — feathered at the edges. The fill keeps its own
    lighting; the patch brings the fine detail, and `tone` (0…1) says how
    much of the patch's broad shading comes along too (sky wants it, a
    display does not).
    """
    h, w = original.shape[:2]
    sx, sy, sw, sh = src
    sx0, sy0 = max(0, int(sx * w)), max(0, int(sy * h))
    sx1, sy1 = min(w, int((sx + sw) * w)), min(h, int((sy + sh) * h))
    patch = cv2.resize(original[sy0:sy1, sx0:sx1], (x1 - x0, y1 - y0), interpolation=cv2.INTER_CUBIC)
    patch = cv2.flip(patch, 0)
    base = img[y0:y1, x0:x1].astype(np.float32)
    tex = patch.astype(np.float32)
    low_base = cv2.GaussianBlur(base, (0, 0), 6)
    low_tex = cv2.GaussianBlur(tex, (0, 0), 6)
    blended = low_base * (1 - tone) + low_tex * tone + (tex - low_tex)
    mask = np.zeros((y1 - y0, x1 - x0), np.float32)
    m = max(8, min(y1 - y0, x1 - x0) // 6)
    mask[m:-m, m:-m] = 1
    mask = cv2.GaussianBlur(mask, (0, 0), m / 2)[:, :, None]
    return np.clip(base * (1 - mask) + blended * mask, 0, 255).astype(np.uint8)


KEYS = {  # HSV ranges (OpenCV: H 0-180) of the lettering colours
    'cyan': ((80, 70, 125), (112, 255, 255)),
    'white': ((0, 0, 185), (180, 60, 255)),
    'red': ((0, 120, 120), (10, 255, 255)),
}


def key_mask(img, x0, y0, x1, y1, key, pad=3):
    """The pixels inside the box that have the lettering's colour, dilated by `pad`."""
    hsv = cv2.cvtColor(img[y0:y1, x0:x1], cv2.COLOR_BGR2HSV)
    lo, hi = KEYS[key]
    m = cv2.inRange(hsv, np.array(lo, np.uint8), np.array(hi, np.uint8))
    if key == 'red':
        m |= cv2.inRange(hsv, np.array((170, 120, 120), np.uint8), np.array((180, 255, 255), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    return cv2.dilate(m, np.ones((2 * pad + 1, 2 * pad + 1), np.uint8))


def fit_line(original, p0, p1, xa, xb, deg=2, win=16):
    """
    Traces a line of the art: from the approximate endpoints, takes the
    brightest row within `win` px of the guess at many columns between xa
    and xb, and fits a polynomial of degree `deg` through them, dropping the
    columns where lettering or a crossing line pulled the sample away. The
    screen's lines are gently curved, so a straight fit leaves gaps at the
    ends — degree 2 follows them.
    """
    h, w = original.shape[:2]
    v = cv2.cvtColor(original, cv2.COLOR_BGR2HSV)[:, :, 2].astype(np.float32)
    (ax, ay), (bx, by) = p0, p1
    xs = np.arange(int(xa * w), int(xb * w), 3)
    ys = []
    for x in xs:
        t = (x / w - ax) / (bx - ax)
        yg = int(round((ay + (by - ay) * t) * h))
        lo = max(0, yg - win)
        ys.append(lo + int(np.argmax(v[lo:yg + win + 1, x])))
    xs = xs.astype(np.float64)
    ys = np.array(ys, np.float64)
    keep = np.ones(len(xs), bool)
    for _ in range(5):
        coef = np.polyfit(xs[keep], ys[keep], deg)
        res = np.abs(ys - np.polyval(coef, xs))
        k = res < max(2.5, 2 * np.median(res[keep]))
        if k.sum() < deg + 3:
            break
        keep = k
    return np.polyfit(xs[keep], ys[keep], deg)


def redraw_line(img, original, line):
    """
    Draws a line of the art back along [xa, xb]: traces its curve in the
    original, then lays its own cross-section (sampled at `sampleX`) along
    that path. The profile goes in at its true brightness, blended by its own
    strength, so the line neither doubles where one is already present nor
    dims because whatever it is drawn over has a different level.
    """
    h, w = original.shape[:2]
    xa, xb = line.get('range', (0, 1))
    fr = line.get('fitRange', (xa, xb))
    coef = fit_line(original, line['from'], line['to'], fr[0], fr[1], int(line.get('deg', 2)), int(line.get('win', 16)))
    half = int(line.get('half', 8))
    xs_ = int(line['sampleX'] * w)
    y_int = int(round(np.polyval(coef, xs_)))
    prof = original[y_int - half:y_int + half + 1, xs_].astype(np.float32)
    bg = (prof[:2].mean(axis=0) + prof[-2:].mean(axis=0)) / 2
    delta = prof - bg                       # the line, without its background
    strength = np.abs(delta).max(axis=1)
    alpha = strength / max(strength.max(), 1e-6)
    out = img.astype(np.float32)
    n = 2 * half + 1
    for x in range(int(xa * w), int(xb * w)):
        y = float(np.polyval(coef, x))
        y0 = int(np.floor(y)); f = y - y0
        for k in range(-half, half):
            yy = y0 + k
            if not (0 <= yy < h):
                continue
            # the profile resampled at this row's real distance from the curve,
            # so a one-pixel-wide line keeps its peak at any sub-pixel offset
            j = k - f + half
            j0 = int(np.floor(j)); t = j - j0
            if j0 < 0 or j0 + 1 >= n:
                continue
            d = delta[j0] * (1 - t) + delta[j0 + 1] * t
            aa = alpha[j0] * (1 - t) + alpha[j0 + 1] * t
            out[yy, x] = out[yy, x] * (1 - aa) + (bg + d) * aa
    img[:] = np.clip(out, 0, 255).astype(np.uint8)



def restore_shading(img, original, mask, sigma=35):
    """
    Gives a filled region the shading of the surface it belongs to.

    Inpainting a large area invents its own gradient and pulls colour in from
    whatever borders it — the warm bezel above a screen, say — so the fill can
    come out the wrong brightness and the wrong hue. The art still holds the
    answer: the surface is only hidden where the lettering sits. This keeps the
    fill's fine detail and replaces its low frequencies with the original's,
    measured with a normalised blur over the surface itself, lettering
    excluded — so the light across the screen comes back as it was painted.
    """
    m = mask > 0
    hsv = cv2.cvtColor(original, cv2.COLOR_BGR2HSV)
    H, S, V = hsv[:, :, 0].astype(int), hsv[:, :, 1].astype(int), hsv[:, :, 2].astype(int)
    letters = (((V > 140) & (S > 40) & (H > 70) & (H < 120)) | (V > 205))
    letters = cv2.dilate(letters.astype(np.uint8) * 255, np.ones((21, 21), np.uint8)) > 0
    valid = (m & ~letters).astype(np.float32)   # the surface, as the art painted it
    if valid.sum() < 500:
        return img
    wsum = cv2.GaussianBlur(valid, (0, 0), sigma) + 1e-6
    out = img.astype(np.float32)
    org = original.astype(np.float32)
    for ch in range(3):
        low_org = cv2.GaussianBlur(org[:, :, ch] * valid, (0, 0), sigma) / wsum
        low_img = cv2.GaussianBlur(out[:, :, ch] * valid, (0, 0), sigma) / wsum
        out[:, :, ch][m] += (low_org - low_img)[m]
    return np.clip(out, 0, 255).astype(np.uint8)


def erase(n):
    name = f'panel-{n:02d}.jpg'
    src = os.path.join(ORIG, name)
    img = cv2.imread(src)
    if img is None:
        raise SystemExit(f'missing {src}')
    h, w = img.shape[:2]
    original = img.copy()
    small_mask = np.zeros((h, w), np.uint8)
    large_mask = np.zeros((h, w), np.uint8)
    seam_mask = np.zeros((h, w), np.uint8)  # the edges of filled boxes, blended afterwards
    count = 0
    patches = []
    grained = []
    redraws = []
    protected = np.zeros((h, w), np.uint8)  # art a box asked to keep; no seam pass may touch it
    shade_mask = np.zeros((h, w), np.uint8)  # filled area that takes its shading back from the art
    for box, kind, fill, patch, tone, entry in regions(FX.get(f'panel{n:02d}', [])):
        x0, y0, x1, y1 = rect(box, w, h, pad=6 if kind != 'sprite' else 10)
        if x1 <= x0 or y1 <= y0:
            continue
        count += 1
        if patch:
            patches.append(((x0, y0, x1, y1), patch, tone))
        if fill == 'rows':
            # a flat surface with lettering all over it (a screen): each row takes
            # the colour of the same row in a clean strip of that surface, the
            # frame lines and protected boxes stay, grain goes back on
            m = np.full((y1 - y0, x1 - x0), 255, np.uint8)
            for pb in entry.get('protect', []):
                px0, py0, px1, py1 = rect(pb, w, h, pad=0)
                m[max(py0, y0) - y0:max(py1, y0) - y0, max(px0, x0) - x0:max(px1, x0) - x0] = 0
            if entry.get('guard'):
                g = np.zeros((h, w), np.uint8)
                for pts in entry['guard']:
                    poly = [(int(px * w), int(py * h)) for px, py in pts]
                    for p, q in zip(poly, poly[1:]):
                        cv2.line(g, p, q, 255, int(entry.get('guardWidth', 8)))
                m[g[y0:y1, x0:x1] > 0] = 0
            split = int(float(entry.get('splitY', 0)) * h)
            rows = np.zeros((y1 - y0, 3), np.float32)
            for y in range(y0, y1):
                sx0, sx1 = entry['stripAbove'] if (y < split and entry.get('stripAbove')) else entry['strip']
                rows[y - y0] = np.median(original[y, int(sx0 * w):int(sx1 * w)], axis=0)
            rows = cv2.GaussianBlur(rows.reshape(-1, 1, 3), (0, 0), 3).reshape(-1, 3)
            region = img[y0:y1, x0:x1]
            filled = np.repeat(rows[:, None, :], x1 - x0, axis=1)
            region[m > 0] = filled[m > 0].astype(np.uint8)
            img[y0:y1, x0:x1] = region
            grained.append((x0, y0, x1, y1))
            continue
        if fill:
            img[y0:y1, x0:x1] = rim_fill(img, x0, y0, x1, y1)
            img[y0:y1, x0:x1] = with_grain(img, x0, y0, x1, y1)
            box_mask = np.zeros((h, w), np.uint8)
            box_mask[y0:y1, x0:x1] = 255
            seam_mask |= cv2.dilate(box_mask, np.ones((7, 7), np.uint8)) - cv2.erode(box_mask, np.ones((7, 7), np.uint8))
            continue
        if entry.get('key'):
            # lettering over detail that must survive (a face): mask only the
            # letters' own colour, a little dilated
            keys = entry['key'] if isinstance(entry['key'], list) else [entry['key']]
            m = np.zeros((y1 - y0, x1 - x0), np.uint8)
            for k in keys:
                m = np.maximum(m, key_mask(original, x0, y0, x1, y1, k, int(entry.get('pad', 3))))
        else:
            m = np.full((y1 - y0, x1 - x0), 255, np.uint8)
        for pb in entry.get('protect', []):
            px0, py0, px1, py1 = rect(pb, w, h, pad=0)
            m[max(py0, y0) - y0:max(py1, y0) - y0, max(px0, x0) - x0:max(px1, x0) - x0] = 0
        for poly in entry.get('protectPoly', []):
            pm = np.zeros((h, w), np.uint8)
            cv2.fillPoly(pm, [np.array([[int(px * w), int(py * h)] for px, py in poly], np.int32)], 255)
            m[pm[y0:y1, x0:x1] > 0] = 0
        pa = entry.get('protectAbove')
        if pa:
            # everything above a traced line of the art is kept (a screen's top
            # bezel): the boundary follows the line's own curve, so no straight
            # edge cuts across the picture and nothing below the line survives
            pc = fit_line(original, pa['from'], pa['to'], *pa.get('fitRange', (x0 / w, x1 / w)), int(pa.get('deg', 2)), int(pa.get('win', 16)))
            margin = float(pa.get('margin', 6))
            for xx in range(x0, x1):
                cut = min(y1, int(round(np.polyval(pc, xx) + margin)))
                if cut > y0:
                    m[:cut - y0, xx - x0] = 0
        redraws.extend(entry.get('redraw', []))
        if entry.get('guard'):
            # lines of the art that cross the box (a screen's frame): never erased
            g = np.zeros((h, w), np.uint8)
            for pts in entry['guard']:
                poly = [(int(px * w), int(py * h)) for px, py in pts]
                for p, q in zip(poly, poly[1:]):
                    cv2.line(g, p, q, 255, int(entry.get('guardWidth', 8)))
            m[g[y0:y1, x0:x1] > 0] = 0
        target = large_mask if (x1 - x0) * (y1 - y0) > LARGE else small_mask
        target[y0:y1, x0:x1] = np.maximum(target[y0:y1, x0:x1], m)
        protected[y0:y1, x0:x1] |= np.where(m > 0, 0, 255).astype(np.uint8)
        if entry.get('shade'):
            shade_mask[y0:y1, x0:x1] = np.maximum(shade_mask[y0:y1, x0:x1], m)
        if kind != 'header' and not entry.get('key'):
            grained.append((x0, y0, x1, y1))
    if large_mask.any():
        # coarse fill: inpaint at half size with a wide radius (the surface's
        # gradients and glare carry across), blend back, smooth the seam
        k = 2
        small = cv2.resize(img, (w // k, h // k), interpolation=cv2.INTER_AREA)
        m = cv2.resize(cv2.dilate(large_mask, np.ones((5, 5), np.uint8)), (w // k, h // k), interpolation=cv2.INTER_NEAREST)
        filled = cv2.inpaint(small, m, 10, cv2.INPAINT_TELEA)
        up = cv2.resize(filled, (w, h), interpolation=cv2.INTER_CUBIC)
        up = cv2.GaussianBlur(up, (0, 0), 2)
        sel = large_mask > 0
        img[sel] = up[sel]
        seam = cv2.dilate(large_mask, np.ones((9, 9), np.uint8)) - cv2.erode(large_mask, np.ones((9, 9), np.uint8))
        seam[protected > 0] = 0
        img = cv2.inpaint(img, seam, 4, cv2.INPAINT_TELEA)
    if small_mask.any():
        img = cv2.inpaint(img, small_mask, 6, cv2.INPAINT_TELEA)
    if shade_mask.any():
        img = restore_shading(img, original, shade_mask)
    # straight lines of the art that ran through an erased box (a screen's frame)
    # are drawn back from a clean sample of themselves
    for line in redraws:
        redraw_line(img, original, line)
    # the surface's grain back on every inpainted box (inpainting is smooth)
    for x0, y0, x1, y1 in grained:
        img[y0:y1, x0:x1] = with_grain(img, x0, y0, x1, y1)
    for (x0, y0, x1, y1), src, tone in patches:
        img[y0:y1, x0:x1] = textured(img, original, x0, y0, x1, y1, src, tone)
    seam_mask[protected > 0] = 0
    if seam_mask.any():
        img = cv2.inpaint(img, seam_mask, 3, cv2.INPAINT_TELEA)
    cv2.imwrite(os.path.join(OUT, name), img, [cv2.IMWRITE_JPEG_QUALITY, 86, cv2.IMWRITE_JPEG_PROGRESSIVE, 1])
    # the blurred fill behind the panel (and under its reveal covers): small, soft, dim
    bg = cv2.resize(img, (640, round(640 * h / w)), interpolation=cv2.INTER_AREA)
    bg = cv2.GaussianBlur(bg, (0, 0), 14)
    bg = np.clip(bg.astype(np.float32) * 0.55, 0, 255).astype(np.uint8)
    cv2.imwrite(os.path.join(OUT, name.replace('.jpg', '-bg.jpg')), bg, [cv2.IMWRITE_JPEG_QUALITY, 80])
    preview = np.maximum(np.maximum(small_mask, large_mask), seam_mask)
    cv2.imwrite(os.path.join(CACHE, f'erase-{n:02d}.png'), preview)
    print(f'{name}: {count} regions erased')


todo = [int(a) for a in sys.argv[1:]] or sorted(int(k[-2:]) for k in FX)
for n in todo:
    erase(n)
print('done -> client/public/intro/')
