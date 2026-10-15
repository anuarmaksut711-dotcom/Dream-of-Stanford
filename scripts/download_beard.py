"""Create a pinned local snapshot of the original Hugging Face repository."""
import hashlib
import json
import os
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "models" / "beard"
REPO = "dima806/beard_face_image_detection"
REVISION = "f13217aeacd0a42fee035b903681cbf7fdf1e1e7"


def download():
    DEST.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(f"https://huggingface.co/api/models/{REPO}/revision/{REVISION}", timeout=60) as response:
        metadata = json.load(response)
    revision = metadata["sha"]
    if revision != REVISION:
        raise RuntimeError("Upstream returned an unexpected model revision")
    manifest_path = DEST / "upstream.json"
    previous = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    hashes = {}
    for item in metadata["siblings"]:
        name = item["rfilename"]
        if name not in {"config.json", "preprocessor_config.json", "model.safetensors", "README.md", ".gitattributes"}:
            continue
        path = DEST / name
        if not (previous.get("revision") == revision and path.exists()):
            print(f"Downloading {name} ...", flush=True)
            temp = path.with_suffix(path.suffix + ".part")
            with urllib.request.urlopen(f"https://huggingface.co/{REPO}/resolve/{revision}/{name}", timeout=180) as response, temp.open("wb") as target:
                while chunk := response.read(1024 * 1024):
                    target.write(chunk)
            os.replace(temp, path)
        digest = hashlib.sha256()
        with path.open("rb") as source:
            while chunk := source.read(1024 * 1024):
                digest.update(chunk)
        hashes[name] = digest.hexdigest()
    if "model.safetensors" not in hashes:
        raise RuntimeError("The upstream repository has no expected safetensors weights")
    manifest_path.write_text(json.dumps({"repository": REPO, "revision": revision, "license": "apache-2.0", "sha256": hashes}, indent=2) + "\n", encoding="utf-8")
    print(f"Snapshot ready: {revision}", flush=True)


if __name__ == "__main__":
    download()
