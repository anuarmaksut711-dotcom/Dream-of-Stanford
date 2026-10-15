"""Verify locally installed DeepFace Race/Timhalland weights through the API."""
import math

from smoke_models import client, request


if __name__ == "__main__":
    assert client.get("/api/health").json["timhalland_ready"], "Install the Timhalland ONNX weights first"
    response = request("analyze", options={"actions": ["Timhalland"]})
    image = response["results"][0]
    assert "error" not in image, image.get("error")
    assert image["faces"], "No face detected in the test image"
    for face in image["faces"]:
        assert not face["errors"], face["errors"]
        attributes = face["attributes"]
        scores = attributes["Timhalland"]
        assert set(scores) == {"Asian", "Indian", "Black", "White", "East", "Latino"}, scores
        assert all(math.isfinite(score) and 0 <= score <= 100 for score in scores.values()), scores
        assert abs(sum(scores.values()) - 100) < 0.01, scores
        assert attributes["dominant_Timhalland"] == max(scores, key=scores.get), attributes
    print("PASS: Timhalland upload API inference; six valid class scores, no module errors")
    print(f"Elapsed: {response['elapsed_seconds']} s")
