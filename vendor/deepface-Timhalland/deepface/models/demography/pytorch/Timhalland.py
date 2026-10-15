# stdlib dependencies
import os
from typing import Any, List, Union

# 3rd party dependencies
import torch
from numpy.typing import NDArray

# project dependencies
from deepface.commons import weight_utils
from deepface.models.demography.DemographyUtils import TIMHALLAND_LABELS
from deepface.models.demography.pytorch.TorchDemography import (
    TorchDemography,
    VggFaceClassifier,
)
from deepface.models.facial_recognition.pytorch.TorchFacialRecognition import load_model_weights
from deepface.commons.logger import Logger

# pylint: disable=line-too-long

WEIGHTS_URL = [source for source in [os.environ.get("TIMHALLAND_WEIGHTS_URL", "")] if source]
# Output category labels for the model.
labels = TIMHALLAND_LABELS

CLASSES = 6

logger = Logger()


# pylint: disable=too-few-public-methods
class TimhallandClient(TorchDemography):
    """
    Timhalland model class - pytorch backend
    """

    def __init__(self) -> None:
        self.model_name = "Timhalland"
        self.device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
        self.model = load_model().to(self.device)

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


class TimhallandModel(VggFaceClassifier):
    """
    Timhalland model, predicting a probability for each of the labels above
    """

    def __init__(self) -> None:
        super().__init__(CLASSES)


def base_model() -> TimhallandModel:
    """
    Base model of the Timhalland model
    Returns:
        model (TimhallandModel)
    """
    return TimhallandModel()


def load_model(  # pylint: disable=dangerous-default-value
    url: Union[str, List[str]] = WEIGHTS_URL,
) -> TimhallandModel:
    """
    Construct Timhalland model, download its weights and load
    Returns:
        model (TimhallandModel)
    """
    model = base_model()

    weight_file = weight_utils.download_weights_if_necessary(
        file_name="timhalland_model_single_batch.pth", source_url=url
    )

    return load_model_weights(model=model, weight_file=weight_file)
