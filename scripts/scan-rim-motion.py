"""Find REVIEW candidates around the fixed hoop in this sample, never confirmed scores.

The ROI is manually calibrated for 示例.mp4 after applying its rotation metadata.
Other cameras require a new calibration. Motion alone cannot establish a made basket.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument("video")
parser.add_argument("--output", required=True)
args = parser.parse_args()
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
width, height, fps = 100, 130, 30
cmd = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-i", args.video,
       "-vf", "fps=30,crop=100:130:230:180", "-an", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]
process = subprocess.Popen(cmd, stdout=subprocess.PIPE)
previous = None
records = []
frame_index = 0
while True:
    raw = process.stdout.read(width * height * 3)
    if len(raw) != width * height * 3:
        break
    frame = np.frombuffer(raw, dtype=np.uint8).reshape(height, width, 3).astype(np.float32)
    gray = frame.mean(axis=2)
    if previous is not None:
        delta = np.abs(gray - previous)
        # Net interior, avoiding the stationary red rim and bright ceiling light.
        net = delta[44:98, 19:70]
        above = delta[0:34, 12:86]
        below = delta[98:130, 5:90]
        records.append([frame_index / fps, float(net.mean()), float(above.mean()), float(below.mean())])
    previous = gray
    frame_index += 1
returncode = process.wait()
if returncode:
    raise RuntimeError(f"ffmpeg failed: {returncode}")
(out / "rim-motion.json").write_text(json.dumps(records))
values = np.array(records)
# Require a strong local motion peak; merge peaks within a single shot/rebound sequence.
threshold = max(12.0, float(np.median(values[:, 1]) + 10 * np.median(np.abs(values[:, 1] - np.median(values[:, 1])))))
peaks = []
for row in sorted(records, key=lambda x: -x[1]):
    if row[1] < threshold:
        break
    if all(abs(row[0] - p[0]) > 5.0 for p in peaks):
        peaks.append(row)
peaks.sort()
candidates = [{"id": f"rim-{round(p[0]*fps)}", "timestamp": round(p[0], 3),
               "start": round(max(0, p[0] - 6), 3), "end": round(min(frame_index/fps, p[0] + 2), 3),
               "signal": round(p[1], 3), "status": "unreviewed",
               "reason": "篮网区域运动峰值；可能为进球、擦网、碰筐或遮挡，需回看"} for p in peaks]
digest = hashlib.sha256()
with open(args.video, "rb") as f:
    for block in iter(lambda: f.read(1024*1024), b""):
        digest.update(block)
(out / "shot-candidates.json").write_text(json.dumps({"videoKey": digest.hexdigest(), "fps": fps, "duration": frame_index/fps,
    "roi": [230,180,100,130], "threshold": threshold, "candidates": candidates}, ensure_ascii=False, indent=2))
print(json.dumps({"frames": frame_index, "candidates": len(candidates), "threshold": threshold, "times": [c["timestamp"] for c in candidates]}), flush=True)
