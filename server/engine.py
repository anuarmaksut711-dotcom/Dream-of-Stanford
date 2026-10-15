"""Adapters around the unmodified archive and the pinned beard snapshot."""
from __future__ import annotations

import base64
from functools import lru_cache
from io import BytesIO
import os
from pathlib import Path
import sys
import tempfile
from typing import Any

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

ROOT = Path(__file__).resolve().parents[1]
for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="replace")
os.environ.setdefault("DEEPFACE_HOME", str(ROOT / ".cache"))
os.environ.setdefault("HF_HOME", str(ROOT / ".cache" / "huggingface"))
os.environ.setdefault("DEEPFACE_BACKEND_ENGINE", "onnx")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
sys.path.insert(0, str(ROOT / "vendor" / "deepface-Timhalland"))
Image.MAX_IMAGE_PIXELS = 16_000_000

MODELS = ["SFace", "Facenet", "Facenet512", "ArcFace", "VGG-Face", "OpenFace", "DeepFace", "DeepID", "GhostFaceNet", "Buffalo_L"]
DETECTORS = ["opencv", "yunet", "ssd", "centerface", "skip"]
METRICS = ["cosine", "euclidean", "euclidean_l2", "angular"]
ACTIONS = ["beard", "emotion", "age", "gender", "Timhalland"]


class InputError(ValueError):
    pass


def decode_upload(upload) -> tuple[str, np.ndarray]:
    raw = upload.stream.read(10 * 1024 * 1024 + 1)
    if len(raw) > 10 * 1024 * 1024:
        raise InputError("Файл больше 10 МБ. Выберите фотографию меньшего размера.")
    try:
        with Image.open(BytesIO(raw)) as image:
            if image.format not in {"JPEG", "PNG", "WEBP"}:
                raise InputError("Поддерживаются только JPG, PNG и WebP.")
            if image.width * image.height > 16_000_000:
                raise InputError("Изображение больше 16 мегапикселей. Уменьшите его размер.")
            rgb = ImageOps.exif_transpose(image).convert("RGB")
            rgb.thumbnail((2400, 2400))
            array = np.array(rgb)[:, :, ::-1].copy()
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise InputError("Не удалось прочитать изображение. Выберите исправный JPG, PNG или WebP.") from exc
    name = (upload.filename or "camera.jpg").replace("\\", "/").split("/")[-1][:180]
    return name, array


def image_data(rgb: np.ndarray) -> str:
    image = Image.fromarray(np.asarray(rgb, dtype=np.uint8))
    image.thumbnail((360, 360))
    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=85)
    return "data:image/jpeg;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


def json_safe(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_safe(v) for v in value]
    if isinstance(value, np.ndarray):
        return json_safe(value.tolist())
    if isinstance(value, np.generic):
        return json_safe(value.item())
    if isinstance(value, float) and not np.isfinite(value):
        return None
    return value


def timhalland_ready() -> bool:
    return bool(os.environ.get("TIMHALLAND_WEIGHTS_URL")) or (Path(os.environ["DEEPFACE_HOME"]) / ".deepface" / "weights" / "timhalland_model_single_batch.onnx").is_file()


def parse_options(raw: dict) -> dict:
    if not isinstance(raw, dict):
        raise InputError("Настройки должны быть объектом JSON.")
    options = {"model_name": "SFace", "detector_backend": "opencv", "distance_metric": "cosine", "align": True, "enforce_detection": True, "anti_spoofing": False, "expand_percentage": 0, "beard_threshold": 0.5, "actions": ["beard"]}
    options.update({k: v for k, v in raw.items() if k in options})
    for key, allowed in [("model_name", MODELS), ("detector_backend", DETECTORS), ("distance_metric", METRICS)]:
        if options[key] not in allowed:
            raise InputError(f"Неизвестное значение {key}.")
    for key in ["align", "enforce_detection", "anti_spoofing"]:
        if type(options[key]) is not bool:
            raise InputError(f"Настройка {key} должна быть true или false.")
    for key, low, high in [("expand_percentage", 0, 50), ("beard_threshold", 0, 1)]:
        value = options[key]
        if type(value) not in (float, int) or not np.isfinite(value) or not low <= value <= high:
            raise InputError(f"Настройка {key} вне допустимого диапазона.")
    options["expand_percentage"] = int(options["expand_percentage"])
    if not isinstance(options["actions"], list) or not options["actions"] or any(a not in ACTIONS for a in options["actions"]):
        raise InputError("Выберите хотя бы один доступный модуль анализа.")
    options["actions"] = list(dict.fromkeys(options["actions"]))
    if "Timhalland" in options["actions"] and not timhalland_ready():
        raise InputError("Для Timhalland нужны пользовательские веса. Инструкция находится в README.md.")
    return options


@lru_cache(maxsize=1)
def deepface():
    from deepface import DeepFace
    from server.compat import configure_opencv
    configure_opencv()
    return DeepFace


@lru_cache(maxsize=1)
def beard_model():
    import torch
    from transformers import AutoImageProcessor, AutoModelForImageClassification
    model_path = ROOT / "models" / "beard"
    if not (model_path / "model.safetensors").is_file():
        raise FileNotFoundError("Запустите install.ps1, чтобы скачать модель бороды.")
    torch.set_num_threads(min(4, os.cpu_count() or 1))
    processor = AutoImageProcessor.from_pretrained(str(model_path), local_files_only=True, use_fast=False)
    model = AutoModelForImageClassification.from_pretrained(str(model_path), local_files_only=True, use_safetensors=True)
    model.eval()
    return processor, model


def classify_beard(rgb: np.ndarray, threshold: float) -> dict:
    import torch
    processor, model = beard_model()
    inputs = processor(images=Image.fromarray(rgb), return_tensors="pt")
    with torch.inference_mode():
        scores = model(**inputs).logits.softmax(dim=-1)[0].tolist()
    predictions = [{"label": model.config.id2label[i], "score": float(score)} for i, score in enumerate(scores)]
    beard = next((p for p in predictions if p["label"].strip().lower() == "beard"), None)
    if beard is None:
        raise RuntimeError("В конфигурации модели отсутствует класс Beard.")
    return {"has_beard": beard["score"] >= threshold, "score": beard["score"], "threshold": threshold, "predictions": predictions}


def detection_options(options: dict) -> dict:
    return {k: options[k] for k in ["detector_backend", "align", "enforce_detection", "anti_spoofing", "expand_percentage"]}


def error_message(exc: Exception) -> str:
    name = type(exc).__name__
    if name == "SpoofDetected" or "spoof detected" in str(exc).lower():
        return "Проверка подлинности отклонила изображение. Попробуйте другой снимок или отключите эту проверку."
    if name == "FaceNotDetected" or "face could not be detected" in str(exc).lower():
        return "Лицо не найдено. Выберите чёткий снимок анфас или измените детектор."
    if isinstance(exc, (ImportError, ModuleNotFoundError)):
        return "Не хватает зависимости модели. Повторно запустите install.ps1."
    if isinstance(exc, FileNotFoundError):
        return "Не найдены веса модели. Запустите install.ps1 или проверьте путь к пользовательским весам."
    if isinstance(exc, InputError):
        return str(exc)
    return "Модель не выполнила обработку. Проверьте интернет для первой загрузки весов и журнал сервера."


def extract(image: np.ndarray, options: dict) -> list[dict]:
    return deepface().extract_faces(img_path=image, **detection_options(options), color_face="rgb", normalize_face=True)


def analyze_image(name: str, image: np.ndarray, options: dict, mode: str) -> dict:
    api = deepface()
    faces = extract(image, options)
    output = []
    for index, face in enumerate(faces):
        rgb = np.clip(face["face"] * 255, 0, 255).astype(np.uint8)
        result = {"index": index + 1, "region": face["facial_area"], "confidence": face["confidence"], "crop": image_data(rgb), "attributes": {}, "errors": []}
        for key in ["is_real", "antispoof_score"]:
            if key in face:
                result[key] = face[key]
        if mode == "analyze" and face.get("is_real", True) is False:
            result["errors"].append({"module": "anti_spoofing", "message": "Изображение отклонено проверкой подлинности."})
        elif mode == "analyze":
            for action in options["actions"]:
                try:
                    if action == "beard":
                        result["beard"] = classify_beard(rgb, options["beard_threshold"])
                    else:
                        analysis = api.analyze(img_path=rgb[:, :, ::-1].copy(), actions=[action], detector_backend="skip", enforce_detection=False, align=False, silent=True)[0]
                        result["attributes"].update({k: v for k, v in analysis.items() if k not in {"region", "face_confidence"}})
                except Exception as exc:
                    import logging
                    logging.exception("Attribute %s failed", action)
                    result["errors"].append({"module": action, "message": error_message(exc)})
        output.append(result)
    return {"filename": name, "width": image.shape[1], "height": image.shape[0], "faces": output}


def run(mode: str, images: list[tuple[str, np.ndarray]], gallery: list[tuple[str, np.ndarray]], options: dict) -> dict:
    api = deepface()
    common = detection_options(options)
    if mode in {"analyze", "extract"}:
        results = []
        for name, image in images:
            try:
                results.append(analyze_image(name, image, options, mode))
            except Exception as exc:
                import logging
                logging.exception("Image processing failed")
                results.append({"filename": name, "error": error_message(exc)})
        return {"results": results}
    if mode == "verify":
        result = api.verify(img1_path=images[0][1], img2_path=images[1][1], model_name=options["model_name"], distance_metric=options["distance_metric"], **common)
        return {"comparison": result, "files": [item[0] for item in images]}
    if mode == "represent":
        results = []
        for name, image in images:
            try:
                result = api.represent(img_path=image, model_name=options["model_name"], **common)
                results.append({"filename": name, "faces": result})
            except Exception as exc:
                import logging
                logging.exception("Embedding failed")
                results.append({"filename": name, "error": error_message(exc)})
        return {"results": results}
    if mode == "find":
        # A request-scoped gallery: no persistent images, identity database or pickle cache.
        with tempfile.TemporaryDirectory(prefix="face-lab-") as directory:
            names = {}
            for i, (name, image) in enumerate(gallery):
                path = Path(directory) / f"{i:03d}.jpg"
                Image.fromarray(image[:, :, ::-1]).save(path, quality=95)
                names[path.name] = name
            frames = api.find(img_path=images[0][1], db_path=directory, model_name=options["model_name"], distance_metric=options["distance_metric"], silent=True, refresh_database=True, **common)
            groups = []
            for frame in frames:
                records = frame.to_dict(orient="records")
                for row in records:
                    file_key = Path(row["identity"]).name
                    row["identity"] = names.get(file_key, file_key)
                    row["gallery_index"] = int(Path(file_key).stem)
                groups.append(records)
        return {"matches": groups, "query": images[0][0], "gallery_count": len(gallery)}
    raise InputError("Неизвестный режим работы.")
