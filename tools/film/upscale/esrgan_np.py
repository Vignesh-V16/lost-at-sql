"""
Real-ESRGAN (RRDBNet) inference in plain numpy — no torch. Loads the
official .pth checkpoint (zip format) with a minimal unpickler and runs the
network with BLAS matmuls. Built for RealESRGAN_x4plus_anime_6B (64 feat,
6 blocks, grow 32, 4×), works for x4plus (23 blocks) too, just slower.

  python3 esrgan_np.py model.pth in.png out.png [--tile 128]
"""
import io
import pickle
import sys
import zipfile
from collections import OrderedDict

import numpy as np
from PIL import Image


# ── checkpoint loading without torch ───────────────────────────────
class _Storage:
    def __init__(self, dtype, data):
        self.dtype = dtype
        self.data = data


class _Unpickler(pickle.Unpickler):
    def __init__(self, f, zf, prefix):
        super().__init__(f)
        self.zf = zf
        self.prefix = prefix

    def find_class(self, module, name):
        if name == '_rebuild_tensor_v2':
            return _rebuild_tensor
        if name.endswith('Storage'):
            return {'FloatStorage': np.float32, 'HalfStorage': np.float16, 'DoubleStorage': np.float64, 'LongStorage': np.int64, 'IntStorage': np.int32, 'ByteStorage': np.uint8}.get(name, np.float32)
        if module == 'collections' and name == 'OrderedDict':
            return OrderedDict
        if name == '_rebuild_parameter':
            return lambda data, requires_grad, hooks: data
        return super().find_class(module, name)

    def persistent_load(self, pid):
        # ('storage', dtype, key, location, numel)
        _, dtype, key, _, numel = pid
        raw = self.zf.read(f'{self.prefix}data/{key}')
        arr = np.frombuffer(raw, dtype=dtype, count=numel)
        return _Storage(dtype, arr)


def _rebuild_tensor(storage, offset, size, stride, *_):
    arr = storage.data
    itemsize = arr.dtype.itemsize
    return np.lib.stride_tricks.as_strided(arr[offset:], shape=tuple(size), strides=tuple(s * itemsize for s in stride)).astype(np.float32)


def load_state_dict(path):
    zf = zipfile.ZipFile(path)
    pkl = [n for n in zf.namelist() if n.endswith('data.pkl')][0]
    prefix = pkl[: -len('data.pkl')]
    obj = _Unpickler(io.BytesIO(zf.read(pkl)), zf, prefix).load()
    if isinstance(obj, dict) and 'params_ema' in obj:
        obj = obj['params_ema']
    elif isinstance(obj, dict) and 'params' in obj:
        obj = obj['params']
    return {k: np.ascontiguousarray(v) for k, v in obj.items()}


# ── the network ─────────────────────────────────────────────────────
def conv3x3(x, w, b):
    """x: (C, H, W) float32 · w: (O, C, 3, 3) · b: (O,) → (O, H, W), padding 1."""
    C, H, W = x.shape
    O = w.shape[0]
    xp = np.pad(x, ((0, 0), (1, 1), (1, 1)))
    out = np.zeros((O, H * W), dtype=np.float32)
    for dy in range(3):
        for dx in range(3):
            shifted = xp[:, dy:dy + H, dx:dx + W].reshape(C, H * W)
            out += w[:, :, dy, dx] @ shifted
    out += b[:, None]
    return out.reshape(O, H, W)


def lrelu(x):
    return np.where(x > 0, x, 0.2 * x)


def rdb(x, p, pre):
    x1 = lrelu(conv3x3(x, p[f'{pre}.conv1.weight'], p[f'{pre}.conv1.bias']))
    x2 = lrelu(conv3x3(np.concatenate([x, x1]), p[f'{pre}.conv2.weight'], p[f'{pre}.conv2.bias']))
    x3 = lrelu(conv3x3(np.concatenate([x, x1, x2]), p[f'{pre}.conv3.weight'], p[f'{pre}.conv3.bias']))
    x4 = lrelu(conv3x3(np.concatenate([x, x1, x2, x3]), p[f'{pre}.conv4.weight'], p[f'{pre}.conv4.bias']))
    x5 = conv3x3(np.concatenate([x, x1, x2, x3, x4]), p[f'{pre}.conv5.weight'], p[f'{pre}.conv5.bias'])
    return x5 * 0.2 + x


def rrdb(x, p, pre):
    out = rdb(x, p, f'{pre}.rdb1')
    out = rdb(out, p, f'{pre}.rdb2')
    out = rdb(out, p, f'{pre}.rdb3')
    return out * 0.2 + x


def upsample2(x):
    return x.repeat(2, axis=1).repeat(2, axis=2)


def run_tile(img, p, nblocks):
    """img: (3, h, w) in 0…1 → (3, 4h, 4w)."""
    fea = conv3x3(img, p['conv_first.weight'], p['conv_first.bias'])
    trunk = fea
    for i in range(nblocks):
        trunk = rrdb(trunk, p, f'body.{i}')
    trunk = conv3x3(trunk, p['conv_body.weight'], p['conv_body.bias'])
    fea = fea + trunk
    fea = lrelu(conv3x3(upsample2(fea), p['conv_up1.weight'], p['conv_up1.bias']))
    fea = lrelu(conv3x3(upsample2(fea), p['conv_up2.weight'], p['conv_up2.bias']))
    out = conv3x3(lrelu(conv3x3(fea, p['conv_hr.weight'], p['conv_hr.bias'])), p['conv_last.weight'], p['conv_last.bias'])
    return out


def upscale(img_u8, p, tile=128, pad=12):
    """img_u8: (H, W, 3) uint8 → (4H, 4W, 3) uint8, processed in overlapping tiles."""
    nblocks = max(int(k.split('.')[1]) for k in p if k.startswith('body.')) + 1
    x = img_u8.astype(np.float32).transpose(2, 0, 1) / 255.0
    _, H, W = x.shape
    out = np.zeros((3, H * 4, W * 4), dtype=np.float32)
    for y0 in range(0, H, tile):
        for x0 in range(0, W, tile):
            y1 = min(H, y0 + tile)
            x1 = min(W, x0 + tile)
            ys = max(0, y0 - pad)
            xs = max(0, x0 - pad)
            ye = min(H, y1 + pad)
            xe = min(W, x1 + pad)
            piece = run_tile(x[:, ys:ye, xs:xe], p, nblocks)
            oy = (y0 - ys) * 4
            ox = (x0 - xs) * 4
            out[:, y0 * 4:y1 * 4, x0 * 4:x1 * 4] = piece[:, oy:oy + (y1 - y0) * 4, ox:ox + (x1 - x0) * 4]
            print(f'  tile {y0},{x0}', flush=True)
    out = np.clip(out, 0, 1).transpose(1, 2, 0)
    return (out * 255 + 0.5).astype(np.uint8)


if __name__ == '__main__':
    model, src, dst = sys.argv[1:4]
    tile = int(sys.argv[sys.argv.index('--tile') + 1]) if '--tile' in sys.argv else 128
    params = load_state_dict(model)
    im = np.asarray(Image.open(src).convert('RGB'))
    res = upscale(im, params, tile=tile)
    Image.fromarray(res).save(dst, quality=95)
    print('wrote', dst, res.shape)
