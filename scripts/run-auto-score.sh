#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
PYTHON=.venv-analysis/bin/python
VIDEO="${BASKETBALL_SAMPLE_VIDEO:-../示例.mp4}"
PROXY=.local-run/sample-review/upright-10fps.mp4
OUT=.local-run/auto-score
# The fixed camera and roster templates must belong to the selected video.
# This sample runner intentionally does not claim support for arbitrary cameras.
"$PYTHON" scripts/test-basketball-model.py "$PROXY" --original "$VIDEO" --seconds 100000 --output "$OUT"
"$PYTHON" scripts/test-basketball-model.py "$PROXY" --original "$VIDEO" --seconds 100000 --output "$OUT/rim" --rim-windows
"$PYTHON" - <<'PY'
import json
from pathlib import Path
p=Path('.local-run/auto-score')
a=json.loads((p/'basketball-detection.json').read_text());b=json.loads((p/'rim/basketball-detection.json').read_text())
assert a['videoKey']==b['videoKey'] and a['proxyKey']==b['proxyKey']
index={f['timestamp']:f for f in a['frames']}
for f in b['frames']: index[f['timestamp']]['detections']+=f['detections']
a['source']+=' + enlarged rim windows'
(p/'combined-detection.json').write_text(json.dumps(a))
PY
"$PYTHON" scripts/auto-score-sample.py --detections "$OUT/combined-detection.json"
