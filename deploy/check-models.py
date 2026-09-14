"""Check known model bytes without deserializing model checkpoints."""
import hashlib
import json
from pathlib import Path


def verify(directory, manifest):
    errors = []
    for name, expected in manifest.items():
        file = directory / name
        if not file.is_file():
            errors.append(f"Missing model: {name}")
            continue
        digest = hashlib.sha256()
        with file.open('rb') as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b''):
                digest.update(chunk)
        if digest.hexdigest() != expected:
            errors.append(f"Model checksum mismatch: {name}")
    return errors


if __name__ == '__main__':
    root = Path(__file__).resolve().parents[1]
    manifest = json.loads((root / 'deploy/models.sha256.json').read_text())
    errors = verify(root / '.local-run/models', manifest)
    if errors:
        raise SystemExit('\n'.join(errors) + '\nSee SERVER-DEPLOYMENT.md for model setup.')
    print('Model checksums verified.', flush=True)
