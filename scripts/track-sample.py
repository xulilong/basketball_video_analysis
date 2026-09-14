"""Local, bounded multi-object tracking experiment for the supplied sample.

Track IDs are tracklets, NOT verified identities. No score is inferred from a person
box or a ball detection. Writes evidence for inspecting tracking/ball coverage.
"""
import argparse
import hashlib
import json
import os
import time
from pathlib import Path

# Only the explicitly downloaded official Ultralytics checkpoint is loaded here.
os.environ["TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD"] = "1"
os.environ["YOLO_CONFIG_DIR"] = str(Path(__file__).resolve().parents[1] / ".local-run/yolo-config")
import cv2
import numpy as np
import torch
from ultralytics import YOLO

parser = argparse.ArgumentParser()
parser.add_argument("video", help="upright 10fps proxy created with ffmpeg")
parser.add_argument("--original", required=True)
parser.add_argument("--seconds", type=float, default=90)
parser.add_argument("--output", required=True)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
cap = cv2.VideoCapture(args.video)
fps = cap.get(cv2.CAP_PROP_FPS)
if not cap.isOpened() or fps <= 0:
    raise RuntimeError("Cannot decode video")
device = "mps" if torch.backends.mps.is_available() else "cpu"
torch.set_num_threads(4)
model = YOLO(str(root / ".local-run/models/yolo11s.pt"))
model.overrides["verbose"] = False
tracks = {}
frames = []
started = time.monotonic()
index = 0
while index / fps < args.seconds:
    ok, image = cap.read()
    if not ok:
        break
    timestamp = index / fps
    index += 1
    if (index - 1) % 2:
        continue
    result = model.track(image, persist=True, tracker="bytetrack.yaml", classes=[0, 32],
                         conf=0.15, imgsz=960, device=device, verbose=False)[0]
    detections = []
    boxes = result.boxes
    if boxes is not None:
        for box in boxes:
            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].cpu().tolist()]
            label = int(box.cls.item())
            confidence = float(box.conf.item())
            track_id = int(box.id.item()) if box.id is not None else None
            height = y2 - y1
            # Calibrated foreground boundary for this fixed camera only.
            in_court = label != 0 or (y2 > 510 + 0.022 * ((x1+x2)/2) and height > 80)
            detections.append({"track": track_id, "class": "person" if label == 0 else "ball",
                               "bbox": [round(x1,1),round(y1,1),round(x2-x1,1),round(height,1)],
                               "confidence": round(confidence,3), "inCourt": in_court})
            if label != 0 or not in_court or track_id is None:
                continue
            crop = image[max(0,int(y1)):min(image.shape[0],int(y2)), max(0,int(x1)):min(image.shape[1],int(x2))]
            if not crop.size:
                continue
            track = tracks.setdefault(track_id, {"id": f"track-{track_id}", "first": timestamp,
                "last": timestamp, "observations": 0, "quality": 0, "photo": f"track-{track_id}.jpg"})
            track["last"] = timestamp
            track["observations"] += 1
            quality = height * confidence
            if quality > track["quality"]:
                track["quality"] = quality
                track["capturedAt"] = timestamp
                scale = min(1, 360 / crop.shape[0])
                crop = cv2.resize(crop, (max(1,int(crop.shape[1]*scale)),max(1,int(crop.shape[0]*scale))))
                cv2.imwrite(str(out / track["photo"]), crop)
    frames.append({"timestamp": round(timestamp,3), "detections": detections})
    if len(frames) % 100 == 0:
        print(f"Analyzed {timestamp:.1f}s, {len(tracks)} tracklets, elapsed {time.monotonic()-started:.1f}s", flush=True)
cap.release()
kept = [t for t in tracks.values() if t["observations"] >= 5]
digest = hashlib.sha256()
with open(args.original,"rb") as f:
    for block in iter(lambda: f.read(1024*1024),b""):
        digest.update(block)
report = {"videoKey": digest.hexdigest(), "analyzedSeconds": round(index/fps,2),
          "sampleFPS": fps/2, "device": device, "model": "yolo11s.pt", "tracker": "ByteTrack",
          "tracklets": kept, "frames": frames,
          "personObservations": sum(d["class"]=="person" and d["inCourt"] for f in frames for d in f["detections"]),
          "ballFrames": sum(any(d["class"]=="ball" for d in f["detections"]) for f in frames),
          "processedFrames": len(frames), "elapsedSeconds": round(time.monotonic()-started,2)}
(out / "tracking.json").write_text(json.dumps(report, ensure_ascii=False))
print(json.dumps({k:v for k,v in report.items() if k not in ("frames","tracklets")}), flush=True)
