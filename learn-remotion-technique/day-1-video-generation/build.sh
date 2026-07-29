#!/usr/bin/env bash
# The exact pipeline that produced out/Day01_MakeTheLogoBigger.mp4, end to end.
# Every step is deterministic: same inputs -> byte-identical output.
set -euo pipefail
cd "$(dirname "$0")"

FPS=30
FRAMES=510                       # 15s body + 2s end card
OUT=out/Day01_MakeTheLogoBigger.mp4

echo "==> 1/5  synthesise the voiceless audio track"
python3 audio/build_audio.py
#   writes out/day01_audio.wav        (bed + SFX, ducked, -14 LUFS, -1 dBTP)
#          out/stems/{bed,sfx}.wav    (verification stems only)
#          audio/cues.json            (the cue table, frame-accurate)
cp out/day01_audio.wav public/     # Remotion reads it via staticFile()

echo "==> 2/5  emit the machine-readable beat sheet"
node scripts/emit-script-json.mjs
#   writes day01.script.json from timeline.js + cues.json, so it cannot drift

echo "==> 3/5  render $FRAMES PNG frames"
node renderer/render.mjs frames 0 $FRAMES
#   Chromium over CDP: setFrame(n) -> Page.captureScreenshot -> frames/fNNNN.png
#   This is the same "pure function of frame -> headless screenshot" model the
#   Remotion CLI uses. `npm run render:day01` is the Remotion-native equivalent.

echo "==> 4/5  mux video + audio"
ffmpeg -y -loglevel error \
  -framerate $FPS -i frames/f%04d.png \
  -i out/day01_audio.wav \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 17 -preset slow -g 60 \
  -movflags +faststart \
  -c:a aac -b:a 256k -ar 48000 \
  -shortest "$OUT"

echo "==> 5/5  verify against the brief"
python3 verify.py

echo
echo "done -> $OUT"
ffprobe -v error -show_entries format=duration,size \
        -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames \
        -of default=noprint_wrappers=1 "$OUT"
