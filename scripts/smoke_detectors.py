"""Check detectors using the user's private QARAS_SMOKE_IMAGE photo."""
from smoke_models import request

if __name__ == "__main__":
    for detector in ["opencv", "yunet", "ssd", "centerface", "skip"]:
        result = request("extract", options={"detector_backend": detector})
        assert result["results"][0].get("faces"), result
        print(f"PASS: {detector}", flush=True)
    result = request("extract", options={"anti_spoofing": True})
    assert "is_real" in result["results"][0]["faces"][0], result
    print("PASS: FasNet real inference (this is not a liveness accuracy benchmark)", flush=True)
