"""Download the official TensorFlow COCO-SSD weights for local browser inference."""
import json
import pathlib
import subprocess

target = pathlib.Path(__file__).resolve().parents[1] / "public/models/coco-ssd"
target.mkdir(parents=True, exist_ok=True)
base = "https://storage.googleapis.com/tfjs-models/savedmodel/ssd_mobilenet_v2/"

def download(name):
    dest = target / name
    temp = dest.with_suffix(dest.suffix + ".tmp")
    subprocess.run(["curl", "-fL", "--retry", "2", "--max-time", "180", base + name, "-o", str(temp)], check=True)
    temp.replace(dest)

download("model.json")
model = json.loads((target / "model.json").read_text())
for group in model["weightsManifest"]:
    for name in group["paths"]:
        if pathlib.Path(name).name != name:
            raise ValueError("Unexpected weight path")
        download(name)
print("COCO-SSD ready:", target)
