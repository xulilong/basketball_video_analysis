"""Stop only this workspace's public tunnel/gateway; keep local app running."""
import os
from pathlib import Path
import signal
import subprocess

root = Path(__file__).resolve().parents[1] / '.local-run/public-share'
for name, marker in [('tunnel', 'cloudflared tunnel'), ('gateway', 'share-local-proxy.mjs')]:
    file = root / (name + '.pid')
    if not file.exists():
        continue
    pid = int(file.read_text())
    command = subprocess.run(['ps', '-p', str(pid), '-o', 'command='], capture_output=True, text=True).stdout
    if marker in command:
        try:
            os.kill(pid, signal.SIGTERM)
            print('Stopped', name)
        except ProcessLookupError:
            pass
    elif command.strip():
        raise SystemExit(f'Refusing to stop unrelated process {pid}')
    file.unlink(missing_ok=True)
