#!/bin/zsh
# ./make.sh <WxH> <out.mp4>   renders the promo in 6 parallel parts (16 drawn moments per frame, for
# motion blur), joins them and adds score.wav. Needs ffmpeg on PATH or in $FFMPEG.
set -e
SIZE=$1; OUT=$2; FF=${FFMPEG:-ffmpeg}
TMP=$(mktemp -d)
# the length comes from timeline.js: beats × 60 / bpm, in whole 60fps frames
FRAMES=$(node -e 'global.window={}; require("./timeline.js"); const T=window.TL; console.log(Math.ceil(T.beats*60/T.bpm*60))')
SUB=16; PARTS=6; PER=$(( (FRAMES + PARTS - 1) / PARTS ))
for i in $(seq 0 $((PARTS - 1))); do
  FROM=$((i * PER * SUB)); TO=$(( (i + 1) * PER * SUB )); [ $TO -gt $((FRAMES * SUB)) ] && TO=$((FRAMES * SUB))
  ( node render.js $SIZE stream $((60 * SUB)) $FROM $TO | $FF -y -loglevel error -f image2pipe -framerate $((60 * SUB)) -c:v mjpeg -i - \
      -vf "tmix=frames=$SUB,select='eq(mod(n\,$SUB)\,$((SUB - 1)))',setpts=N/60/TB,scale=in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p" \
      -r 60 -c:v libx264 -preset slow -crf 16 -color_range tv -colorspace bt709 -color_primaries bt709 -color_trc bt709 $TMP/part$i.mp4 ) &
done
wait
for i in $(seq 0 $((PARTS - 1))); do echo "file '$TMP/part$i.mp4'"; done > $TMP/list.txt
$FF -y -loglevel error -f concat -safe 0 -i $TMP/list.txt -i score.wav -c:v copy -c:a aac -b:a 320k -shortest -movflags +faststart $OUT
rm -rf $TMP
echo "wrote $OUT"
