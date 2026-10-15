from io import BytesIO
import json
import unittest
import tempfile
from pathlib import Path
from unittest.mock import patch

from PIL import Image
from server.app import create_app, LOCK
from server import engine


def photo(name="test.png"):
    data = BytesIO()
    Image.new("RGB", (100, 80), color="white").save(data, format="PNG")
    data.seek(0)
    return data, name


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.app = create_app()
        self.app.testing = True
        self.client = self.app.test_client()

    def post(self, **data):
        return self.client.post("/api/run", data={"images": photo(), **data}, content_type="multipart/form-data")

    def test_static_and_health(self):
        for path in ["/", "/static/app.js", "/static/i18n.js", "/static/style.css", "/static/mark.svg", "/static/fonts/Manrope.ttf"]:
            with self.client.get(path) as response:
                self.assertEqual(response.status_code, 200, path)
        self.assertIn("timhalland_ready", self.client.get("/api/health").json)

    def test_no_images_or_invalid_mode(self):
        self.assertEqual(self.client.post("/api/run", data={"mode": "find"}, content_type="multipart/form-data").status_code, 400)
        self.assertEqual(self.post(mode="unknown").status_code, 400)

    def test_invalid_options_are_rejected(self):
        for value in ["{", "null", "[]", '{"beard_threshold": 5}', '{"anti_spoofing":"false"}', '{"actions":[]}', '{"actions":["unknown"]}', '{"model_name":"../../file"}']:
            self.assertEqual(self.post(options=value).status_code, 400, value)

    def test_invalid_image_is_rejected(self):
        response = self.post(images=(BytesIO(b"not a photo"), "photo.png"))
        self.assertEqual(response.status_code, 400)
        self.assertIn("JPG", response.json["error"])

    def test_verification_and_gallery_counts(self):
        self.assertEqual(self.post(mode="verify").status_code, 400)
        self.assertEqual(self.post(mode="find").status_code, 400)
        self.assertEqual(self.post(images=[photo() for _ in range(9)]).status_code, 400)
        self.assertEqual(self.post(gallery=photo()).status_code, 400)

    def test_cross_origin_submission_is_rejected(self):
        response = self.client.post("/api/run", data={"images": photo()}, headers={"Origin": "https://unrelated.example"}, content_type="multipart/form-data")
        self.assertEqual(response.status_code, 403)

    def test_busy_server_and_lock_release_after_failure(self):
        LOCK.acquire()
        try:
            self.assertEqual(self.post().status_code, 409)
        finally:
            LOCK.release()
        with self.assertLogs(level="ERROR"):
            with patch("server.engine.run", side_effect=RuntimeError("internal path must not leak")):
                response = self.post()
        self.assertEqual(response.status_code, 422)
        self.assertNotIn("internal path", response.json["error"])
        self.assertFalse(LOCK.locked())

    def test_decoding_transposes_exif_and_uses_bgr(self):
        from werkzeug.datastructures import FileStorage
        buffer = BytesIO()
        image = Image.new("RGB", (20, 10), "red")
        exif = image.getexif(); exif[274] = 6
        image.save(buffer, format="JPEG", exif=exif)
        buffer.seek(0)
        name, array = engine.decode_upload(FileStorage(buffer, filename="../../portrait.jpg"))
        self.assertEqual(name, "portrait.jpg")
        self.assertEqual(array.shape[:2], (20, 10))
        self.assertGreater(array[0, 0, 2], 250)
        self.assertLess(array[0, 0, 0], 5)

    def test_cyrillic_gallery_paths(self):
        engine.deepface()
        from deepface.commons import image_utils
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "тестовое-фото.png"
            Image.new("RGB", (20, 10), "red").save(path)
            array, name = image_utils.load_image(str(path))
        self.assertEqual(name, str(path))
        self.assertEqual(array.shape, (10, 20, 3))
        self.assertEqual(array[0, 0].tolist(), [0, 0, 255])


if __name__ == "__main__":
    unittest.main()
