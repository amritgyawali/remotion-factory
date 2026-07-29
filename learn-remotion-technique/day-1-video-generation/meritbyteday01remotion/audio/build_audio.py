#!/usr/bin/env python3
"""
DAY 1 — "Make The Logo Bigger" : voiceless audio track.

Everything here is synthesised from oscillators and filtered noise, so there is
no possibility of a vocal pad, a breath or a chant sneaking in — which is the
failure mode the brief calls out for "instrumental" music libraries.

Bed      : playful plucked synth, layer added per round, hard stop at the ping.
SFX      : pitch-escalating snaps (+0/+2/+4/+6/+8/+10 semitones), boing,
           scratch, sub thump, whoosh, typing blips, ping, pop, chime, zip, sting.
Mix      : bed -16 LUFS, SFX -8..-12 dBFS, 4 dB / 6 frame duck under each major
           hit, master -14 LUFS integrated with a -1 dBTP true-peak ceiling.
"""
import json
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
FPS = 30
SPF = SR // FPS               # 1600 samples per frame — frame-exact placement
DURATION_FRAMES = 510         # 15s body + 2s end card
N = DURATION_FRAMES * SPF

BPM = 90                      # 88-108 band for DevJoke; 90 makes beat=20 frames,
BEAT_F = 20                   # eighth=10 and sixteenth=5 — every cue lands on a
EIGHTH_F = 10                 # whole frame AND on the musical grid.
BAR_F = 80

F = lambda sec: int(round(sec * FPS))
smp = lambda frame: frame * SPF

rng = np.random.default_rng(20260729)


# ---------------------------------------------------------------- helpers ---
def env_exp(n, tau, attack=0.002):
    t = np.arange(n) / SR
    e = np.exp(-t / tau)
    a = int(attack * SR)
    if a > 1:
        e[:a] *= np.linspace(0, 1, a)
    return e


def add(buf, sig, frame, gain=1.0):
    i = smp(frame)
    if i >= len(buf):
        return
    s = sig[: len(buf) - i]
    buf[i:i + len(s)] += s * gain


def bp(x, lo, hi, order=4):
    sos = signal.butter(order, [lo / (SR / 2), min(hi, SR / 2 - 100) / (SR / 2)], 'bandpass', output='sos')
    return signal.sosfilt(sos, x)


def hp(x, f, order=4):
    return signal.sosfilt(signal.butter(order, f / (SR / 2), 'highpass', output='sos'), x)


def lp(x, f, order=4):
    return signal.sosfilt(signal.butter(order, f / (SR / 2), 'lowpass', output='sos'), x)


def norm_peak(x, dbfs):
    p = np.max(np.abs(x))
    return x * (10 ** (dbfs / 20) / p) if p > 0 else x


# ------------------------------------------------------------ instruments ---
def pluck(freq, dur, amp=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k, w in enumerate([1.0, 0.42, 0.24, 0.13, 0.07, 0.04], start=1):
        out += w * np.sin(2 * np.pi * freq * k * t + rng.random() * 6.28) * np.exp(-t / (0.20 / (k ** 0.55)))
    click = hp(rng.normal(0, 1, n), 2500) * np.exp(-t / 0.004) * 0.16
    return (out * 0.32 + click) * amp


def bass_note(freq, dur, amp=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    sub = np.sin(2 * np.pi * freq * t)
    body = signal.sawtooth(2 * np.pi * freq * t) * 0.22
    return lp(sub + body, 320) * env_exp(n, 0.34, 0.006) * 0.55 * amp


def kick(amp=1.0):
    n = int(0.30 * SR)
    t = np.arange(n) / SR
    f = 118 * np.exp(-t / 0.028) + 46
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, 0.12, 0.001)
    tick = hp(rng.normal(0, 1, n), 3000) * np.exp(-t / 0.003) * 0.22
    return (body + tick) * 0.9 * amp


def shaker(amp=1.0):
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    return bp(rng.normal(0, 1, n), 4800, 11000) * np.exp(-t / 0.020) * 0.5 * amp


def hat(amp=1.0, open_=False):
    n = int((0.16 if open_ else 0.07) * SR)
    t = np.arange(n) / SR
    return hp(rng.normal(0, 1, n), 7200) * np.exp(-t / (0.055 if open_ else 0.016)) * 0.42 * amp


def pad_chord(freqs, dur, amp=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for f0 in freqs:
        for det in (-0.15, 0.0, 0.15):
            out += np.sin(2 * np.pi * (f0 + det) * t + rng.random() * 6.28)
    a = int(0.05 * SR)
    e = np.ones(n)
    e[:a] = np.linspace(0, 1, a)
    return lp(out / (len(freqs) * 3), 3200) * e * amp


# -------------------------------------------------------------------- SFX ---
def shutter_snap(semitones=0):
    """Hard shutter snap. Pitched up a semitone-pair per round -> rising absurdity."""
    r = 2 ** (semitones / 12)
    n = int(0.16 * SR)
    t = np.arange(n) / SR
    transient = hp(rng.normal(0, 1, n), 1800 * r) * np.exp(-t / 0.010) * 1.0
    thock = np.sin(2 * np.pi * 240 * r * t) * np.exp(-t / 0.030) * 0.7
    ring = np.sin(2 * np.pi * 1650 * r * t) * np.exp(-t / 0.045) * 0.22
    metal = bp(rng.normal(0, 1, n), 2600 * r, min(9000 * r, 20000)) * np.exp(-t / 0.055) * 0.35
    return transient + thock + ring + metal


def boing():
    n = int(0.42 * SR)
    t = np.arange(n) / SR
    f = 660 * np.exp(-t / 0.11) + 150 + 26 * np.sin(2 * np.pi * 11 * t)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, 0.13, 0.004) * 0.9


def record_scratch():
    n = int(0.24 * SR)
    t = np.arange(n) / SR
    wob = 1 + 0.55 * signal.sawtooth(2 * np.pi * 15 * t)
    src = bp(rng.normal(0, 1, n), 400, 4200) * wob
    return src * env_exp(n, 0.09, 0.003) * 0.8


def sub_thump():
    n = int(0.55 * SR)
    t = np.arange(n) / SR
    f = 52 * np.exp(-t / 0.20) + 30
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, 0.17, 0.004) * 1.0


def whoosh(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    src = rng.normal(0, 1, n)
    out = np.zeros(n)
    chunk = 1024
    for i in range(0, n, chunk):
        c = src[i:i + chunk]
        pos = i / n
        centre = 300 + 4200 * pos ** 1.6
        out[i:i + len(c)] = bp(c, max(120, centre * 0.55), min(centre * 1.8, 18000))[: len(c)]
    swell = np.sin(np.pi * np.linspace(0, 1, n)) ** 1.2
    return out * swell * 0.55


def typing_blip():
    n = int(0.05 * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * 1450 * t) * 0.6 + np.sin(2 * np.pi * 2350 * t) * 0.3) * env_exp(n, 0.012, 0.001)


def message_ping():
    n = int(0.85 * SR)
    t = np.arange(n) / SR
    a = np.sin(2 * np.pi * 1318.5 * t) * env_exp(n, 0.22, 0.002)
    b = np.sin(2 * np.pi * 1975.5 * t) * env_exp(n, 0.16, 0.002) * 0.55
    c = np.sin(2 * np.pi * 2637.0 * t) * env_exp(n, 0.09, 0.002) * 0.25
    return a + b + c


def comedic_pop():
    n = int(0.13 * SR)
    t = np.arange(n) / SR
    f = 320 + 900 * (t / (n / SR)) ** 0.5
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, 0.030, 0.001)
    return tone * 0.9


def confirmation_chime():
    """Bright, resolved — an A major triad against the A-minor bed (Picardy)."""
    out = np.zeros(int(0.9 * SR))
    for i, f0 in enumerate([440.0, 554.37, 659.25, 880.0]):
        n = len(out) - i * int(0.035 * SR)
        t = np.arange(n) / SR
        v = (np.sin(2 * np.pi * f0 * t) + 0.3 * np.sin(2 * np.pi * f0 * 2 * t)) * env_exp(n, 0.30, 0.002)
        out[i * int(0.035 * SR):] += v * (0.9 ** i)
    return out * 0.5


def rewind_zip():
    n = int(0.30 * SR)
    t = np.arange(n) / SR
    f = 260 * np.exp(t / 0.11)
    tone = signal.sawtooth(2 * np.pi * np.cumsum(np.clip(f, 0, 9000)) / SR) * 0.35
    tape = bp(rng.normal(0, 1, n), 900, 9000) * 0.5
    flutter = 1 + 0.3 * np.sin(2 * np.pi * 34 * t)
    return (tone + tape) * flutter * env_exp(n, 0.14, 0.003) * 0.8


def logo_sting():
    n = int(1.5 * SR)
    t = np.arange(n) / SR
    swell = (np.sin(2 * np.pi * 110 * t) * 0.6 + np.sin(2 * np.pi * 164.81 * t) * 0.4)
    swell *= np.minimum(1, t / 0.12) * np.exp(-t / 0.55)
    warm = np.zeros(n)
    for f0 in (440.0, 554.37, 659.25):
        warm += np.sin(2 * np.pi * f0 * t) * env_exp(n, 0.55, 0.010)
    return lp(swell * 0.55 + warm / 3 * 0.5, 6000)


# ------------------------------------------------------------------- bed ----
NOTE = dict(A2=110.00, F2=87.31, G2=98.00, E3=164.81, F3=174.61, G3=196.00,
            A3=220.00, B3=246.94, C4=261.63, D4=293.66, E4=329.63, F4=349.23,
            G4=392.00, A4=440.00, C5=523.25, E5=659.25)

BARS = [  # one entry per bar of the 4-bar cycle: (bass root, 8 eighth-note arp)
    ('A2', ['A3', 'E4', 'C4', 'A4', 'G4', 'E4', 'C4', 'E4']),
    ('A2', ['A3', 'E4', 'C4', 'A4', 'C5', 'A4', 'E4', 'C4']),
    ('F2', ['F3', 'C4', 'A3', 'F4', 'C4', 'A3', 'C4', 'A3']),
    ('G2', ['G3', 'D4', 'B3', 'G4', 'D4', 'B3', 'D4', 'B3']),
]

# Layer gain as a function of absolute frame. This is the whole "adds a layer per
# beat / strips to bass only / stops dead" behaviour from the brief.
def layer_gain(layer, f):
    if F(6) <= f < F(7):                       # 6-7s freeze: bass only, no SFX
        return 1.0 if layer == 'bass' else 0.0
    if F(12) <= f < F(13):                     # 12-13s: music re-enters quietly
        return 0.35 if layer in ('pluck', 'bass') else 0.0
    starts = {'pluck': 0, 'bass': 0, 'kick': F(1), 'shaker': F(2), 'hat': F(3)}
    if f >= F(13):                             # 13s on: everything back to full
        return 1.0
    return 1.0 if f >= starts[layer] else 0.0


# Music plays in these frame spans; `phase` is the frame the 4-bar cycle
# restarts from, so 14-15s literally "resets to bar 1".
SEGMENTS = [(0, F(10) + 12, 0), (F(12), F(14), F(12)), (F(14), F(15), F(14))]

bed = np.zeros(N)

for seg_start, seg_end, phase in SEGMENTS:
    f = seg_start
    while f < seg_end:
        local = f - phase
        bar_i = (local // BAR_F) % 4
        root, arp = BARS[bar_i]
        pos_in_bar = local % BAR_F

        if pos_in_bar % EIGHTH_F == 0:
            g = layer_gain('pluck', f)
            if g:
                idx = (pos_in_bar // EIGHTH_F) % 8
                add(bed, pluck(NOTE[arp[idx]], 0.55), f, 0.70 * g)
        if pos_in_bar % BEAT_F == 0:
            beat = pos_in_bar // BEAT_F
            g = layer_gain('bass', f)
            if g:
                nf = NOTE[root] if beat != 3 else NOTE[root] * (2 ** (-2 / 12) if root == 'A2' else 1)
                add(bed, bass_note(nf, 0.62), f, 0.50 * g)
            g = layer_gain('kick', f)
            if g:
                add(bed, kick(), f, 0.85 * g)
        if pos_in_bar % 5 == 0:                       # sixteenths
            g = layer_gain('shaker', f)
            if g:
                add(bed, shaker(), f, 0.55 * g * (1.0 if (pos_in_bar // 5) % 2 == 0 else 0.6))
        if pos_in_bar % EIGHTH_F == 0:
            g = layer_gain('hat', f)
            if g:
                off = (pos_in_bar // EIGHTH_F) % 2 == 1
                add(bed, hat(open_=off), f, 0.52 * g)
        f += 1

# clear sub mud the phone speaker cannot reproduce but which eats all the headroom
bed = hp(bed, 52, order=2)

# music stops dead on the ping frame (10.4s) — 2-frame fade so it is a stop, not a click
stop = smp(F(10) + 12)
bed[stop:stop + 2 * SPF] *= np.linspace(1, 0, 2 * SPF)
bed[stop + 2 * SPF: smp(F(12))] = 0.0

# end card: the bed resolves to its final chord and fades across the full 2s
chord = pad_chord([NOTE['A2'], NOTE['E3'], NOTE['A3'], NOTE['C4'], NOTE['E4'], NOTE['B3']], 2.0)
chord *= np.linspace(1, 0, len(chord)) ** 1.35
add(bed, chord, F(15), 0.40)


# ------------------------------------------------------------------- SFX ----
sfx = np.zeros(N)
CUES = []


def cue(frame, sig, dbfs, name, major=False):
    add(sfx, norm_peak(sig, dbfs), frame, 1.0)
    CUES.append({'frame': frame, 'second': round(frame / FPS, 3), 'sfx': name,
                 'dbfs': dbfs, 'ducks_bed': major})


# 0-1s  hard shutter snap timed to the spring peak (damping 12 peaks at frame ~12)
cue(12, shutter_snap(0), -9, 'shutter snap', True)
# 1-4s  same snap, +2 / +4 / +6 semitones, one per round
cue(F(1), shutter_snap(2), -9, 'shutter snap +2st', True)
cue(F(2), shutter_snap(4), -9, 'shutter snap +4st', True)
cue(F(3), shutter_snap(6), -9, 'shutter snap +6st', True)
# 4-5s  low comedic boing riding the squash
cue(F(4), boing(), -11, 'comedic boing', False)
# 5-6s  snap plus a short record scratch
cue(F(5), shutter_snap(8), -9, 'shutter snap +8st', True)
cue(F(5) + 4, record_scratch(), -12, 'record scratch', False)
# 6-7s  freeze: no SFX at all
# 7-8s  biggest snap of the sequence plus a sub-bass thump
cue(F(7), shutter_snap(10), -8, 'shutter snap +10st (biggest)', True)
cue(F(7), sub_thump(), -8, 'sub-bass thump', True)
# 8-9s  rising whoosh tracking the pan
cue(F(8), whoosh(1.0), -12, 'rising whoosh', False)
# 9-10s three typing blips, evenly spaced
for i, fr in enumerate((F(9), F(9) + 10, F(9) + 20)):
    cue(fr, typing_blip(), -12, f'typing blip {i + 1}', False)
# 10-11s message ping — the bed stops dead on this frame
cue(F(10) + 12, message_ping(), -9, 'message ping', True)
# 11-12s total silence
# 12-13s soft comedic pop on the snap-back
cue(F(12), comedic_pop(), -12, 'comedic pop', False)
# 13-14s bright confirmation chime
cue(F(13), confirmation_chime(), -10, 'confirmation chime', True)
# 14-15s tape-rewind zip into the loop
cue(F(14), rewind_zip(), -11, 'tape-rewind zip', False)
# +2s    logo sting plus one warm chime
cue(F(15), logo_sting(), -10, 'logo sting + warm chime', True)


# ------------------------------------------------------- duck + normalise ---
def lufs(x):
    """ITU-R BS.1770-4 gated integrated loudness (mono in, LUFS out)."""
    b1 = [1.53512485958697, -2.69169618940638, 1.19839281085285]
    a1 = [1.0, -1.69065929318241, 0.73248077421585]
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, -1.99004745483398, 0.99007225036621]
    y = signal.lfilter(b2, a2, signal.lfilter(b1, a1, x))
    block, hop = int(0.4 * SR), int(0.1 * SR)
    if len(y) < block:
        return -np.inf
    powers = np.array([np.mean(y[i:i + block] ** 2) for i in range(0, len(y) - block, hop)])
    ls = -0.691 + 10 * np.log10(np.maximum(powers, 1e-12))
    keep = powers[ls > -70]
    if keep.size == 0:
        return -np.inf
    rel = -0.691 + 10 * np.log10(np.mean(keep)) - 10
    keep2 = powers[(ls > -70) & (ls > rel)]
    if keep2.size == 0:
        return -np.inf
    return -0.691 + 10 * np.log10(np.mean(keep2))


# bed to -16 LUFS
bed_l = lufs(bed)
bed *= 10 ** ((-16.0 - bed_l) / 20)

# 4 dB duck for 6 frames under every major SFX hit
duck = np.ones(N)
for c in CUES:
    if not c['ducks_bed']:
        continue
    i = smp(c['frame'])
    atk, hold, rel = int(0.006 * SR), 6 * SPF, int(0.09 * SR)
    g = 10 ** (-4 / 20)
    seg = np.concatenate([np.linspace(1, g, atk), np.full(hold, g), np.linspace(g, 1, rel)])
    end = min(N, i + len(seg))
    duck[i:end] = np.minimum(duck[i:end], seg[: end - i])
bed *= duck

mix = bed + sfx

# 11-12s must be absolute silence — kill the ping tail into the beat
s0, s1 = smp(F(11)), smp(F(12))
mix[s0 - 3 * SPF:s0] *= np.linspace(1, 0, 3 * SPF)
mix[s0:s1] = 0.0

# ---- master: -14 LUFS integrated behind a -1 dBTP true-peak limiter --------
from scipy.ndimage import maximum_filter1d

CEILING = 10 ** (-1.0 / 20)


def true_peak(x):
    return np.max(np.abs(signal.resample_poly(x, 4, 1)))


def tp_limiter(x, ceiling=CEILING, lookahead_ms=4.0, release_ms=90.0):
    """Look-ahead limiter driven by the 4x-oversampled (true-peak) envelope."""
    os_ = signal.resample_poly(x, 4, 1)
    la = int(lookahead_ms * SR / 1000) * 4
    peak_os = maximum_filter1d(np.abs(os_), size=2 * la + 1, mode='nearest')
    need_os = np.minimum(1.0, ceiling / np.maximum(peak_os, 1e-9))
    # collapse to base rate, keeping the most restrictive gain in each group of 4
    m = (len(need_os) // 4) * 4
    need = need_os[:m].reshape(-1, 4).min(axis=1)
    need = np.resize(need, len(x))
    # instant attack, exponential release
    rel = np.exp(-1.0 / (release_ms * SR / 1000))
    g = np.empty_like(need)
    cur = 1.0
    for i in range(len(need)):
        cur = need[i] if need[i] < cur else need[i] + (cur - need[i]) * rel
        g[i] = cur
    return x * g


for _ in range(4):
    mix *= 10 ** ((-14.0 - lufs(mix)) / 20)
    if true_peak(mix) > CEILING:
        mix = tp_limiter(mix)
    if abs(lufs(mix) + 14.0) < 0.15 and true_peak(mix) <= CEILING * 1.001:
        break
if true_peak(mix) > CEILING:
    mix *= CEILING / true_peak(mix)

w16 = lambda p, x: wavfile.write(p, SR, (np.clip(np.stack([x, x], 1), -1, 1) * 32767).astype(np.int16))
w16('out/day01_audio.wav', mix)
# verification stems — not used by the render, only by verify.py
w16('out/stems/bed.wav', bed)
w16('out/stems/sfx.wav', sfx)

json.dump({'bpm': BPM, 'fps': FPS, 'cues': CUES}, open('audio/cues.json', 'w'), indent=2)

print(f'bed      : {bed_l:+.2f} -> -16.00 LUFS')
print(f'master   : {lufs(mix):+.2f} LUFS integrated')
print(f'true peak: {20 * np.log10(np.max(np.abs(signal.resample_poly(mix, 4, 1)))):+.2f} dBTP')
print(f'silence  : 11-12s max sample = {np.max(np.abs(mix[s0:s1])):.6f}')
print(f'cues     : {len(CUES)}')
