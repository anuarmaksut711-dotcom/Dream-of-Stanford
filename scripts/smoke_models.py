"""Real inference checks. Initial run downloads the small DeepFace model weights."""
from io import BytesIO
import json
import os
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from server.app import create_app

sample_path = os.environ.get("QARAS_SMOKE_IMAGE")
if not sample_path:
    raise SystemExit("Set QARAS_SMOKE_IMAGE to a local photo you are allowed to use. No test photographs are distributed.")
sample = Path(sample_path).expanduser()
if not sample.is_file():
    raise SystemExit("QARAS_SMOKE_IMAGE must point to an existing local photo.")
raw = sample.read_bytes()
client = create_app().test_client()


def request(mode, count=1, options=None, gallery=False):
    data = {"mode": mode, "options": json.dumps(options or {}), "images": [(BytesIO(raw), f"photo-{i}.jpg") for i in range(count)]}
    if gallery:
        data["gallery"] = [(BytesIO(raw), "gallery-photo.jpg")]
    response = client.post("/api/run", data=data, content_type="multipart/form-data")
    assert response.status_code == 200, response.json
    return response.json


if __name__ == "__main__":
    detection = request("extract")
    assert detection["results"][0]["faces"], detection
    print("PASS: real face detection and JPEG crops", flush=True)
    analysis = request("analyze", options={"actions": ["beard", "emotion"]})
    face = analysis["results"][0]["faces"][0]
    assert not face["errors"], face["errors"]
    assert 0 <= face["beard"]["score"] <= 1
    assert abs(sum(p["score"] for p in face["beard"]["predictions"]) - 1) < 0.001
    assert face["attributes"]["dominant_emotion"]
    print(f"PASS: real Beard ViT and expression models; Beard={face['beard']['score']:.4f}", flush=True)
    comparison = request("verify", count=2)
    assert comparison["comparison"]["verified"], comparison
    print("PASS: same-image SFace verification", flush=True)
    embeddings = request("represent")
    assert len(embeddings["results"][0]["faces"][0]["embedding"]) == 128
    print("PASS: 128-dimensional SFace embedding", flush=True)
    matches = request("find", gallery=True)
    assert matches["matches"][0][0]["identity"] == "gallery-photo.jpg", matches
    print("PASS: request-scoped gallery finds its source image", flush=True)
