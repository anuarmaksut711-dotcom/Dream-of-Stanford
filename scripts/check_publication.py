"""Check publishable Git paths without reading or deleting local private data."""
from pathlib import Path, PurePosixPath
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
ALLOWED_GRAPHICS = {"web/mark.svg", "web/qaras-logo.png"}
BLOCKED_SUFFIXES = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tif", ".tiff",
    ".avif", ".heic", ".svg", ".onnx", ".h5", ".hdf5", ".pth", ".pt",
    ".safetensors", ".bin", ".pkl", ".pickle", ".npy", ".npz", ".tflite",
    ".caffemodel", ".pb", ".prototxt", ".csv", ".tsv", ".xlsx", ".xls",
    ".parquet", ".arrow", ".ipynb", ".zip", ".7z", ".rar", ".tar", ".gz",
}
BLOCKED_PARTS = {
    "dataset", "datasets", "data", "metadata", "preview", "output", "results",
    "reports", ".cache", ".venv", "venv", ".runtime", "__pycache__",
    "icon", "benchmarks", "boosted",
}
REQUIRED = {
    "LICENSE": "MIT License",
    "vendor/deepface-Timhalland/LICENSE": "Copyright (c) 2019 Sefik Ilkin Serengil",
    "models/beard/LICENSE": "END OF TERMS AND CONDITIONS",
    "web/fonts/OFL.txt": "SIL OPEN FONT LICENSE Version 1.1",
    "web/fonts/Literata-OFL.txt": "SIL OPEN FONT LICENSE Version 1.1",
    "THIRD_PARTY_NOTICES.md": "dima806",
}


def git(*args):
    return subprocess.check_output(["git", "-C", str(ROOT), *args])


def blocked(name):
    if name in ALLOWED_GRAPHICS:
        return False
    path = PurePosixPath(name)
    parts = [part.lower() for part in path.parts]
    return (
        path.suffix.lower() in BLOCKED_SUFFIXES
        or bool(BLOCKED_PARTS.intersection(parts))
        or any(part.startswith(("maad-face", "1-56", "57-96")) for part in parts)
        or path.name.lower() == ".env"
        or (path.name.lower().startswith(".env.") and path.name != ".env.example")
        or path.suffix.lower() in {".pyc", ".pyo", ".log"}
    )


def main():
    actual_root = Path(git("rev-parse", "--show-toplevel").decode("utf-8").strip())
    if actual_root.resolve() != ROOT.resolve():
        raise SystemExit("FAIL: initialize a separate Git repository in this publication folder")
    names = {p.decode("utf-8") for p in git("ls-files", "--cached", "--others", "--exclude-standard", "-z").split(b"\0") if p}
    commits = git("rev-list", "--all").decode("ascii").splitlines()
    for commit in commits:
        names.update(p.decode("utf-8") for p in git("ls-tree", "-r", "--name-only", "-z", commit).split(b"\0") if p)
    errors = ["Excluded material: " + name for name in sorted(names) if blocked(name)]
    for name, marker in REQUIRED.items():
        file = ROOT / name
        if name not in names or not file.is_file() or marker not in file.read_text(encoding="utf-8"):
            errors.append("Missing license/notice: " + name)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"PASS: {len(names)} publishable paths, {len(commits)} historical commits; required licenses present")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
