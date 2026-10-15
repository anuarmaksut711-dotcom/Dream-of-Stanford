# stdlib dependencies
import os
from typing import Any, List, Union

# 3rd party dependencies
from numpy.typing import NDArray

# project dependencies
from deepface.models.demography.DemographyUtils import TIMHALLAND_LABELS
from deepface.models.demography.onnx.OnnxDemography import OnnxDemography
from deepface.commons.onnx_utils import build_session
from deepface.commons.logger import Logger

logger = Logger()

# pylint: disable=line-too-long

WEIGHTS_URL = [source for source in [os.environ.get("TIMHALLAND_WEIGHTS_URL", "")] if source]

# Output category labels for the model.
labels = TIMHALLAND_LABELS


# pylint: disable=too-few-public-methods
class TimhallandClient(OnnxDemography):
    """
    Timhalland model class - onnx backend
    """

    def __init__(self) -> None:
        self.model_name = "Timhalland"
        self.model = load_model()

    def predict(self, img: Union[NDArray[Any], List[NDArray[Any]]]) -> NDArray[Any]:
        """
        Predict Timhalland probabilities for single or multiple faces
        Args:
            img: Single image as np.ndarray (224, 224, 3) or
                List of images as List[np.ndarray] or
                Batch of images as np.ndarray (n, 224, 224, 3)
        Returns:
            np.ndarray (n, n_timhalland_categories)
            where n_timhalland_categories is the number of Timhalland categories
        """
        # Preprocessing input image or image list.
        imgs = self._preprocess_batch_or_single_input(img)

        # Prediction
        predictions = self._predict_internal(imgs)

        return predictions


def load_model(  # pylint: disable=dangerous-default-value
    url: Union[str, List[str]] = WEIGHTS_URL,
) -> Any:
    """
    Download Timhalland model's onnx graph if necessary and load it
    Returns:
        model (onnxruntime.InferenceSession)
    """
    return build_session(file_name="timhalland_model_single_batch.onnx", source_url=url)
