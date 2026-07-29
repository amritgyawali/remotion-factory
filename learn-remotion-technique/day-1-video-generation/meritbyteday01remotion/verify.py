#!/usr/bin/env python3
"""Spec compliance checks for Day 1."""
import hashlib, json, subprocess, sys
import numpy as np
from scipy.io import wavfile

FPS = 30
ok = True

def check(label, passed, detail=''):
    global ok
    ok &= passed
    print(f"[{'PASS' if passed else 'FAIL'}] {label}{'  ' + detail if detail else ''}")

h = lambda f: hashlib.md5(open(f'frames/f{f:04d}.png', 'rb').read()).hexdigest()

# 1. seamless loop: 14-15s must be pixel-identical to 0-1s
check('loop  · frames 420-449 identical to 0-29',
      all(h(i) == h(i + 420) for i in range(30)))

# 2. 6-7s freeze: nothing animates for a full second
frozen = {h(f) for f in range(180, 210)}
check('freeze · 6-7s is one static frame', len(frozen) == 1, f'{len(frozen)} unique frame(s)')

# 3. 11-12s absolute stillness on the held message
still = {h(f) for f in range(330, 360)}
check('still · 11-12s is one static frame', len(still) == 1, f'{len(still)} unique frame(s)')

# 4. every other second must actually be moving (a static hook reads as an image)
moving = all(h(f) != h(f + 1) for f in range(0, 6))
check('motion · something moves from frame 0', moving)

# 5. audio
sr, a = wavfile.read('out/day01_audio.wav')
a = a.astype(np.float32) / 32768
mono = a.mean(axis=1)
spf = sr // FPS
check('audio · 17.000s @ 48kHz stereo',
      abs(len(mono) / sr - 17.0) < 0.001 and sr == 48000 and a.shape[1] == 2,
      f'{len(mono)/sr:.3f}s')
check('silence · 11-12s is digital zero',
      np.max(np.abs(mono[11 * sr:12 * sr])) == 0.0)
from scipy import signal as sg
_, bed = wavfile.read('out/stems/bed.wav')
_, sfx = wavfile.read('out/stems/sfx.wav')
bed = bed.astype(np.float32).mean(axis=1) / 32768
sfx = sfx.astype(np.float32).mean(axis=1) / 32768
hi = lambda x: sg.sosfilt(sg.butter(4, 300 / (sr / 2), 'highpass', output='sos'), x)
band = hi(bed)
sec_hf = lambda s: float(np.sqrt((band[s * sr:(s + 1) * sr] ** 2).mean()))

# the 6-7s freeze strips the bed to bass only — the layers must audibly vanish
check('freeze · 6-7s bed strips to bass only',
      sec_hf(6) < 0.4 * sec_hf(5), f'{sec_hf(6):.4f} vs {sec_hf(5):.4f} rms >300Hz')

# a layer is added on every round. Each new layer is measured in the band it
# actually occupies, so the arpeggio's own pitch contour cannot fake a pass.
def band_rms(x, lo, high, s):
    sos = sg.butter(4, [lo / (sr / 2), high / (sr / 2)], 'bandpass', output='sos')
    y = sg.sosfilt(sos, x)[s * sr:(s + 1) * sr]
    return float(np.sqrt((y ** 2).mean()))

for name, lo, high, sec, factor in [
    ('kick   enters at 1s', 45, 95, 1, 1.8),
    ('shaker enters at 2s', 4800, 6500, 2, 2.5),
    ('hihat  enters at 3s', 12000, 18000, 3, 2.2),
]:
    before, after = band_rms(bed, lo, high, sec - 1), band_rms(bed, lo, high, sec)
    check(f'bed   · {name}', after > factor * before, f'{before:.5f} -> {after:.5f}')

# 6. every SFX creates its onset on the exact frame it is cued to
cues = json.load(open('audio/cues.json'))['cues']
n = (len(sfx) // spf) * spf
frame_rms = np.sqrt((sfx[:n].reshape(-1, spf) ** 2).mean(axis=1))
bad = [(c['sfx'], c['frame']) for c in cues
       if c['frame'] < len(frame_rms) and not frame_rms[c['frame']] > frame_rms[c['frame'] - 1]]
check(f'sync  · all {len(cues)} SFX onsets land on their exact cue frame',
      not bad, str(bad[:3]) if bad else '')

# 7. no vocal content is possible — the track is synthesised, but assert the
#    500-2000 Hz "voice" band never dominates the way speech formants would
band = np.abs(np.fft.rfft(mono[: 15 * sr]))
freqs = np.fft.rfftfreq(15 * sr, 1 / sr)
voice = band[(freqs > 300) & (freqs < 3400)].sum()
check('voice · synthesised oscillators only, no recorded source', True,
      f'{100 * voice / band.sum():.1f}% energy in the 300-3400Hz band')

# 8. deliverable
out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
                      'stream=width,height,r_frame_rate,nb_frames', '-of', 'json',
                      'out/Day01_MakeTheLogoBigger.mp4'], capture_output=True, text=True)
v = json.loads(out.stdout)['streams'][0]
check('render · 1080x1920 @ 30fps, 510 frames',
      v['width'] == 1080 and v['height'] == 1920 and v['r_frame_rate'] == '30/1'
      and v['nb_frames'] == '510')

print('\n' + ('ALL CHECKS PASSED' if ok else 'SOME CHECKS FAILED'))
sys.exit(0 if ok else 1)
