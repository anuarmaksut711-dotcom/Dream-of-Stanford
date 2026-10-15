"""Windows adapters. Keep the supplied DeepFace source byte-for-byte intact."""
from pathlib import Path


def configure_opencv():
    import cv2
    import numpy as np
    from deepface.models.face_detection import OpenCv
    from deepface.commons import weight_utils

    class UnicodeOpenCvClient(OpenCv.OpenCvClient):
        def build_model(self):
            models = {}
            for key, filename in [("face_detector", "haarcascade_frontalface_default.xml"), ("eye_detector", "haarcascade_eye.xml")]:
                path = Path(cv2.__file__).parent / "data" / filename
                if not path.is_file():
                    path = Path(weight_utils.download_weights_if_necessary(file_name=filename, source_url=OpenCv.HAARCASCADE_URL.format(file_name=filename)))
                # OpenCV's narrow Windows file API cannot open a Cyrillic user path.
                # Its in-memory FileStorage reader uses the exact same XML model.
                storage = cv2.FileStorage(path.read_text(encoding="utf-8"), cv2.FILE_STORAGE_READ | cv2.FILE_STORAGE_MEMORY)
                classifier = cv2.CascadeClassifier()
                try:
                    if not classifier.read(storage.getFirstTopLevelNode()) or classifier.empty():
                        raise RuntimeError(f"Cannot load cascade {filename}")
                finally:
                    storage.release()
                models[key] = classifier
            return models

    OpenCv.OpenCvClient = UnicodeOpenCvClient

    # Other bundled OpenCV detectors have the same narrow-path limitation.
    from deepface.models.face_detection import YuNet, Ssd, CenterFace

    class UnicodeYuNetClient(YuNet.YuNetClient):
        def build_model(self):
            path = weight_utils.download_weights_if_necessary(file_name="face_detection_yunet_2023mar.onnx", source_url=YuNet.WEIGHTS_URL)
            return cv2.FaceDetectorYN.create("onnx", np.frombuffer(Path(path).read_bytes(), dtype=np.uint8), np.empty(0, dtype=np.uint8), (0, 0))

    class UnicodeSsdClient(Ssd.SsdClient):
        def build_model(self):
            proto = weight_utils.download_weights_if_necessary(file_name="deploy.prototxt", source_url=Ssd.MODEL_URL)
            weights = weight_utils.download_weights_if_necessary(file_name="res10_300x300_ssd_iter_140000.caffemodel", source_url=Ssd.WEIGHTS_URL)
            return cv2.dnn.readNetFromCaffe(np.frombuffer(Path(proto).read_bytes(), dtype=np.uint8), np.frombuffer(Path(weights).read_bytes(), dtype=np.uint8))

    class UnicodeCenterFace(CenterFace.CenterFace):
        def __init__(self, weight_path):
            self.net = cv2.dnn.readNetFromONNX(np.frombuffer(Path(weight_path).read_bytes(), dtype=np.uint8))
            self.img_h_new = self.img_w_new = 0
            self.scale_h = self.scale_w = 0.0

    YuNet.YuNetClient = UnicodeYuNetClient
    Ssd.SsdClient = UnicodeSsdClient
    CenterFace.CenterFace = UnicodeCenterFace

    from deepface.commons import image_utils
    original_load_image = image_utils.load_image

    def unicode_load_image(image):
        # DeepFace rejects non-ASCII filenames before cv2.imread; temporary
        # gallery paths inherit the Windows user directory. Decode bytes instead.
        if isinstance(image, str) and not image.isascii() and Path(image).is_file():
            decoded = cv2.imdecode(np.frombuffer(Path(image).read_bytes(), dtype=np.uint8), cv2.IMREAD_COLOR)
            if decoded is None:
                raise ValueError("Cannot decode local gallery image")
            return decoded, image
        return original_load_image(image)

    image_utils.load_image = unicode_load_image
