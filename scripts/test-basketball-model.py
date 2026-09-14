"""Evaluate a basketball-specific detector locally. Produces observations, not scores."""
import hashlib
import argparse
import importlib
import json
import os
from pathlib import Path
os.environ["YOLO_CONFIG_DIR"] = str(Path(__file__).resolve().parents[1] / ".local-run/yolo-config")
import cv2
import torch
from ultralytics import YOLO

parser = argparse.ArgumentParser()
parser.add_argument("video")
parser.add_argument("--original", default=str(Path(__file__).resolve().parents[2] / "示例.mp4"))
parser.add_argument("--seconds", type=float, default=90)
parser.add_argument("--output", required=True)
parser.add_argument("--rim-windows", action="store_true")
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
out = Path(args.output)
out.mkdir(parents=True, exist_ok=True)
windows = json.loads((root / ".local-run/sample-review/shot-candidates.json").read_text())["candidates"] if args.rim_windows else []
checkpoint = root / ".local-run/models/basketball-best.pt"
# Explicit allowlist: only installed torch/Ultralytics architecture classes. Never
# automatically allow every object named by a downloaded pickle checkpoint.
allowed_names = [
    "torch.nn.modules.batchnorm.BatchNorm2d", "ultralytics.nn.modules.conv.Conv",
    "ultralytics.nn.modules.conv.Concat", "torch.nn.modules.pooling.MaxPool2d",
    "torch.nn.modules.conv.Conv2d", "ultralytics.nn.modules.head.Detect",
    "ultralytics.nn.modules.block.DFL", "torch.nn.modules.upsampling.Upsample",
    "torch.nn.modules.activation.SiLU", "torch.nn.modules.container.ModuleList",
    "ultralytics.nn.modules.block.SPPF", "ultralytics.nn.modules.block.Bottleneck",
    "ultralytics.nn.tasks.DetectionModel", "ultralytics.nn.modules.block.C2f",
    "torch.nn.modules.container.Sequential",
]
unknown = set(torch.serialization.get_unsafe_globals_in_checkpoint(checkpoint)) - set(allowed_names)
if unknown:
    raise RuntimeError(f"Unexpected checkpoint objects: {unknown}")
classes = [getattr(importlib.import_module(name.rsplit('.',1)[0]), name.rsplit('.',1)[1]) for name in allowed_names]
torch.serialization.add_safe_globals(classes)
original_load = torch.load
def restricted_load(*a, **kw):
    kw["weights_only"] = True
    return original_load(*a, **kw)
torch.load = restricted_load
try:
    model = YOLO(str(checkpoint))
finally:
    torch.load = original_load
print("Model classes:", model.names, flush=True)
cap = cv2.VideoCapture(args.video)
fps = cap.get(cv2.CAP_PROP_FPS)
device = "mps" if torch.backends.mps.is_available() else "cpu"
torch.set_num_threads(4)
index = 0
frames = []
while index/fps < args.seconds:
    ok, image = cap.read()
    if not ok: break
    timestamp = index/fps
    index += 1
    # Input proxy is 10fps. Retain every frame to evaluate small-ball continuity.
    if args.rim_windows and not any(w['timestamp']-2.5 <= timestamp <= w['timestamp']+.5 for w in windows):
        continue
    if args.rim_windows: image=image[80:400,120:440]
    result = model.predict(image, conf=0.15, imgsz=640 if args.rim_windows else 1280, device=device, verbose=False)[0]
    observations = []
    for box in result.boxes:
        bounds = [round(float(v),1) for v in box.xyxy[0].cpu().tolist()]
        if args.rim_windows: bounds = [bounds[0]+120,bounds[1]+80,bounds[2]+120,bounds[3]+80]
        observations.append({"class": model.names[int(box.cls.item())], "xyxy": bounds, "confidence": round(float(box.conf.item()),3)})
    frames.append({"timestamp": round(timestamp,3), "detections": observations})
    if len(frames)%200==0:
        print("Analyzed",timestamp,"seconds",flush=True)
cap.release()
ball_frames = sum(any(d["class"].lower()=="basketball" for d in f["detections"]) for f in frames)
report = {"videoKey": hashlib.sha256(Path(args.original).read_bytes()).hexdigest(), "proxyKey": hashlib.sha256(Path(args.video).read_bytes()).hexdigest(), "rimWindows": args.rim_windows, "source": "avishah3/AI-Basketball-Shot-Detection-Tracker/best.pt", "sampleFPS": fps,
          "analyzedSeconds": index/fps, "frames": frames, "processedFrames": len(frames), "ballFrames": ball_frames}
(out/"basketball-detection.json").write_text(json.dumps(report))
print(json.dumps({k:v for k,v in report.items() if k!="frames"}),flush=True)
