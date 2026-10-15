from __future__ import annotations

import importlib.util
import json
import logging
from pathlib import Path
import threading
import time
from urllib.parse import urlsplit

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import RequestEntityTooLarge

from server import engine

ROOT = Path(__file__).resolve().parents[1]
LOCK = threading.Lock()


def create_app():
    app = Flask(__name__, static_folder=str(ROOT / "web"), static_url_path="/static")
    app.config.update(MAX_CONTENT_LENGTH=64 * 1024 * 1024, MAX_FORM_MEMORY_SIZE=128 * 1024)
    app.json.ensure_ascii = False

    @app.before_request
    def local_host_only():
        if request.host.split(":")[0].lower() not in {"localhost", "127.0.0.1"}:
            return jsonify(error="Откройте сайт через localhost или 127.0.0.1."), 403

    @app.after_request
    def headers(response):
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        response.headers["Content-Security-Policy"] = "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; font-src 'self'; script-src 'self'; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        return response

    @app.get("/")
    def index():
        return send_from_directory(ROOT / "web", "index.html")

    @app.get("/api/health")
    def health():
        packages = {name: importlib.util.find_spec(name) is not None for name in ["cv2", "onnxruntime", "torch", "transformers", "pandas"]}
        return jsonify({"ready": all(packages.values()), "packages": packages, "beard_downloaded": (ROOT / "models" / "beard" / "model.safetensors").is_file(), "timhalland_ready": engine.timhalland_ready(), "backend": "onnx", "models": engine.MODELS, "detectors": engine.DETECTORS, "metrics": engine.METRICS})

    @app.post("/api/run")
    def process():
        origin = request.headers.get("Origin")
        if origin and urlsplit(origin).netloc != request.host:
            return jsonify(error="Запускайте проверку со страницы локального сайта."), 403
        if not request.content_type or not request.content_type.startswith("multipart/form-data"):
            return jsonify(error="Отправьте фотографии через форму сайта."), 415
        try:
            mode = request.form.get("mode", "analyze")
            if mode not in {"analyze", "verify", "find", "represent", "extract"}:
                raise engine.InputError("Неизвестный режим работы.")
            try:
                options = engine.parse_options(json.loads(request.form.get("options", "{}")))
            except (json.JSONDecodeError, TypeError):
                raise engine.InputError("Некорректные настройки. Обновите страницу и повторите попытку.")
            files = request.files.getlist("images")
            gallery_files = request.files.getlist("gallery")
            if not 1 <= len(files) <= 8 or len(gallery_files) > 12:
                raise engine.InputError("Добавьте от 1 до 8 фотографий; в галерею — до 12.")
            if mode == "verify" and len(files) != 2:
                raise engine.InputError("Для сравнения нужны ровно две фотографии.")
            if mode == "find" and (len(files) != 1 or not gallery_files):
                raise engine.InputError("Для поиска добавьте один исходный снимок и фотографии в галерею.")
            if mode != "find" and gallery_files:
                raise engine.InputError("Галерея используется только в режиме поиска.")
            images = [engine.decode_upload(file) for file in files]
            gallery = [engine.decode_upload(file) for file in gallery_files]
        except engine.InputError as exc:
            return jsonify(error=str(exc)), 400
        if not LOCK.acquire(blocking=False):
            return jsonify(error="Уже идёт обработка. Дождитесь результата и повторите попытку."), 409
        started = time.monotonic()
        try:
            result = engine.run(mode, images, gallery, options)
            return jsonify(engine.json_safe({"mode": mode, "options": options, "elapsed_seconds": round(time.monotonic() - started, 2), **result}))
        except Exception as exc:
            logging.exception("Face Lab request failed")
            return jsonify(error=engine.error_message(exc)), 422
        finally:
            LOCK.release()

    @app.errorhandler(RequestEntityTooLarge)
    def too_large(_error):
        return jsonify(error="Общий размер загрузки больше 64 МБ. Выберите меньше фотографий."), 413

    return app
