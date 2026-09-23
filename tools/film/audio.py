"""
Soundtrack for the panel film: a mood-following synth bed (calm → mystery →
shock → confusion → uncertainty → investigation → urgency) plus the sound
events each shot schedules. Reads film-info.json, writes soundtrack.wav.
"""
import json
import math
import numpy as np
from scipy.signal import butter, lfilter, lfilter_zi

SR = 44100
info = json.load(open('film-info.json'))
TOTAL = info['TOTAL']
pages = info['pages']
N = int(math.ceil((TOTAL + 0.5) * SR))
mix = np.zeros((N, 2))
duck = np.ones(N)  # bed ducking envelope
rng = np.random.default_rng(11)


def t_axis(n):
    return np.arange(n) / SR


def env(n, a=0.01, d=0.2, hold=0.0):
    t = t_axis(n)
    return np.minimum(1, t / max(a, 1e-4)) * np.where(t < hold, 1.0, np.exp(-(t - hold) / max(d, 1e-4)))


def osc(freq, n, kind='sine', glide=None):
    t = t_axis(n)
    if glide:
        f = freq * (glide / freq) ** (t / t[-1])
        ph = 2 * np.pi * np.cumsum(f) / SR
    else:
        ph = 2 * np.pi * freq * t
    if kind == 'square':
        return np.sign(np.sin(ph))
    if kind == 'saw':
        return 2 * ((ph / (2 * np.pi)) % 1) - 1
    if kind == 'tri':
        return 2 * np.abs(2 * ((ph / (2 * np.pi)) % 1) - 1) - 1
    return np.sin(ph)


def bp_noise(n, f0, f1):
    x = rng.uniform(-1, 1, n)
    a = lfilter(*butter(2, [max(30, f0 * 0.6) / (SR / 2), min(SR / 2 - 100, f0 * 1.6) / (SR / 2)], btype='band'), x)
    b = lfilter(*butter(2, [max(30, f1 * 0.6) / (SR / 2), min(SR / 2 - 100, f1 * 1.6) / (SR / 2)], btype='band'), x)
    w = np.linspace(0, 1, n)
    return a * (1 - w) + b * w


def lp(x, fc):
    return lfilter(*butter(2, min(fc, SR / 2 - 100) / (SR / 2), btype='low'), x)


def add(at, sig, gain=1.0, pan=0.0):
    s = int(at * SR)
    if s >= N or s < 0:
        return
    seg = sig[: N - s]
    mix[s:s + len(seg), 0] += gain * (1 - max(0, pan)) * seg
    mix[s:s + len(seg), 1] += gain * (1 + min(0, pan)) * seg


def tone(at, f, kind='sine', dur=0.12, gain=0.3, glide=None, a=0.01, d=None, delay=0.0):
    n = int(dur * SR)
    add(at + delay, osc(f, n, kind, glide) * env(n, a, d or dur / 3), gain)


def noise(at, dur=0.25, gain=0.3, f0=1800, f1=200, a=0.004, d=None, delay=0.0):
    n = int(dur * SR)
    add(at + delay, bp_noise(n, f0, f1) * env(n, a, d or dur / 2.5), gain)


def duck_bed(at, dur, depth=0.15, release=1.2):
    s = int(at * SR)
    n = int((dur + release) * SR)
    e = np.ones(n)
    k = int(dur * SR)
    e[:k] = depth
    e[k:] = depth + (1 - depth) * (1 - np.exp(-np.arange(n - k) / (release * SR / 4)))
    duck[s:s + n] = np.minimum(duck[s:s + n], e[: max(0, min(n, N - s))])


def sfx_ambience(at):
    n = int(4.5 * SR)
    add(at, lp(rng.uniform(-1, 1, n), 380) * env(n, 1.8, 1.6, 1.2), 0.18)


def sfx_hum(at):
    n = int(2.2 * SR)
    t = t_axis(n)
    sig = (osc(110, n) + 0.5 * osc(220, n) + 0.25 * osc(330, n)) * (0.8 + 0.2 * np.sin(2 * np.pi * 5 * t))
    add(at, sig * env(n, 0.4, 0.9, 0.6), 0.12)


def sfx_swell(at):
    n = int(2.6 * SR)
    chord = sum(osc(f, n) for f in [220, 277, 330, 440]) / 4
    add(at, chord * env(n, 1.4, 0.8, 0.4), 0.14)
    add(at, bp_noise(n, 300, 2600) * env(n, 1.6, 0.5, 0.2), 0.1)


def sfx_blip(at):
    tone(at, 1200, 'sine', 0.07, 0.18, glide=1600)


def sfx_tick(at):
    noise(at, 0.02, 0.35, 3200, 3200)
    tone(at, 2400, 'sine', 0.02, 0.15)


def sfx_boom(at):
    tone(at, 55, 'sine', 1.3, 0.9, glide=34, a=0.005, d=0.5)
    noise(at, 0.25, 0.5, 400, 60)
    duck_bed(at, 0.3, 0.4, 1.0)


def sfx_glitch(at):
    for i in range(9):
        d = i * 0.035
        n = int(0.03 * SR)
        add(at + d, osc(200 + (i * 431) % 1400, n, 'square') * env(n, 0.002, 0.02), 0.16)
        noise(at, 0.03, 0.25, 4000 - i * 300, 800, delay=d)


def sfx_critical(at):
    for i in range(5):
        tone(at, 880, 'saw', 0.16, 0.14, delay=i * 0.36)
        tone(at, 660, 'saw', 0.16, 0.14, delay=i * 0.36 + 0.18)


def sfx_riser(at):
    n = int(2.4 * SR)
    add(at, bp_noise(n, 200, 6000) * np.linspace(0, 1, n) ** 2, 0.4)
    add(at, osc(90, n, 'saw', glide=900) * np.linspace(0, 1, n) ** 2, 0.12)


def sfx_collapse(at):
    tone(at, 900, 'sine', 0.5, 0.5, glide=40, a=0.005, d=0.25)
    tone(at + 0.35, 48, 'sine', 1.6, 0.9, glide=30, a=0.005, d=0.6)
    noise(at + 0.35, 0.5, 0.5, 600, 60)
    duck_bed(at + 0.3, 0.8, 0.1, 1.6)


def sfx_silence(at):
    duck_bed(at, 1.4, 0.12, 2.0)


def sfx_thud(at):
    tone(at, 140, 'tri', 0.22, 0.6, glide=50)
    noise(at, 0.12, 0.3, 600, 100, delay=0.01)


def sfx_whoosh(at):
    noise(at, 0.36, 0.22, 400, 2400)


def sfx_type(at):
    noise(at, 0.015, 0.3, 2600, 2600)
    tone(at, 1900, 'sine', 0.018, 0.12)


def sfx_cut(at):
    noise(at, 0.09, 0.45, 2400, 300)


def sfx_lock(at):
    tone(at, 300, 'square', 0.06, 0.16, glide=200)
    tone(at, 200, 'square', 0.08, 0.14, delay=0.07)


def sfx_confirm(at):
    tone(at, 660, 'sine', 0.12, 0.18)
    tone(at, 990, 'sine', 0.16, 0.16, delay=0.11)


SFX = {k[4:]: v for k, v in globals().items() if k.startswith('sfx_')}
for page in pages:
    for s in page['sfx']:
        fn = SFX.get(s['name'])
        if fn:
            fn(page['start'] + s['at'] / 1000)

# ── the bed ────────────────────────────────────────────────────────
MOODS = {
    'calm': (220, 0.05, 0.5, 0.02, 4),
    'mystery': (320, 0.07, 0.9, 0.03, 7),
    'shock': (1200, 0.11, 4.0, 0.08, 16),
    'confusion': (600, 0.09, 2.2, 0.06, 12),
    'uncertainty': (400, 0.08, 1.3, 0.04, 9),
    'investigation': (520, 0.07, 1.8, 0.05, 5),
    'urgency': (760, 0.10, 3.6, 0.08, 6),
}
t = t_axis(N)
params = np.zeros((N, 5))
last = 0
for page in pages:
    a = int(page['start'] * SR)
    b = min(N, int((page['start'] + page['dur']) * SR))
    params[a:b] = MOODS.get(page['mood'], MOODS['calm'])
    last = b
params[last:] = params[last - 1]


def smooth(x, seconds):
    k = max(1, int(seconds * SR))
    c = np.cumsum(np.insert(x, 0, 0.0))
    idx = np.arange(len(x))
    lo = np.maximum(0, idx - k // 2)
    hi = np.minimum(len(x), idx + k // 2 + 1)
    return (c[hi] - c[lo]) / (hi - lo)


cut = smooth(params[:, 0], 1.5)
gain = smooth(params[:, 1], 1.5)
pulse_rate = smooth(params[:, 2], 0.6)
pulse_gain = smooth(params[:, 3], 0.8)
detune = smooth(params[:, 4], 1.0)
ph_a = 2 * np.pi * 55 * t
ph_b = 2 * np.pi * np.cumsum(55 * 2 ** (detune / 1200)) / SR
drone = (2 * ((ph_a / (2 * np.pi)) % 1) - 1) + (2 * ((ph_b / (2 * np.pi)) % 1) - 1)
drone *= 0.6
lfo = 90 * np.sin(2 * np.pi * 0.08 * t)
out = np.zeros(N)
block = 2048
zi = None
for i in range(0, N, block):
    fc = float(np.clip(cut[i] + lfo[i], 60, 6000))
    b_, a_ = butter(2, fc / (SR / 2), btype='low')
    seg = drone[i:i + block]
    if zi is None:
        zi = lfilter_zi(b_, a_) * seg[0]
    y, zi = lfilter(b_, a_, seg, zi=zi)
    out[i:i + block] = y
tri = 2 * np.abs(2 * ((110 * t) % 1) - 1) - 1
gate = (np.sign(np.sin(2 * np.pi * np.cumsum(pulse_rate) / SR)) + 1) / 2
# a slow pad above the drone
pad = sum(osc(f, N) for f in [165, 220, 247]) / 3
pad_env = 0.35 + 0.65 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.05 * t))
bed = (out + tri * gate * pulse_gain + pad * 0.25 * pad_env) * gain
bed *= np.minimum(1, t / 2.5) * np.minimum(1, np.maximum(0, (TOTAL - t) / 1.5)) * duck
mix[:, 0] += bed * 0.9
mix[:, 1] += bed
peak = np.max(np.abs(mix))
mix = np.tanh(mix / max(peak, 1e-6) * 2.0) / np.tanh(2.0) * 0.9
pcm = (mix * 32767).astype(np.int16)
import wave
with wave.open('soundtrack.wav', 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print('soundtrack.wav', round(N / SR, 2), 's · peak', round(float(peak), 3))
