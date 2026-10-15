# stdlib dependencies
import os
from typing import List, Union, Any

# 3rd party dependencies
from numpy.typing import NDArray

# project dependencies
from deepface.models.facial_recognition.tf import VGGFace
from deepface.commons import package_utils, weight_utils
from deepface.models.Demography import Demography
from deepface.models.demography.DemographyUtils import TIMHALLAND_LABELS
from deepface.commons.logger import Logger

# pylint: disable=line-too-long

# dependency configurations
tf_version = package_utils.get_tf_major_version()

if tf_version == 1:
    from keras.models import Model, Sequential
    from keras.layers import Convolution2D, Flatten, Activation
else:
    from tensorflow.keras.models import Model, Sequential
    from tensorflow.keras.layers import Convolution2D, Flatten, Activation

WEIGHTS_URL = [source for source in [os.environ.get("TIMHALLAND_WEIGHTS_URL", "")] if source]
# Output category labels for the model.
labels = TIMHALLAND_LABELS

logger = Logger()


# pylint: disable=too-few-public-methods
class TimhallandClient(Demography):
    """
    Timhalland model class
    """

    def __init__(self) -> None:
        self.model = load_model()
        self.model_name = "Timhalland"

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
) -> Model:
    """
    Construct Timhalland model, download its weights and load
    """

    model = VGGFace.base_model()

    # --------------------------

    classes = 6
    base_model_output = Sequential()
    base_model_output = Convolution2D(classes, (1, 1), name="predictions")(model.layers[-4].output)
    base_model_output = Flatten()(base_model_output)
    base_model_output = Activation("softmax")(base_model_output)

    # --------------------------

    timhalland_model = Model(inputs=model.inputs, outputs=base_model_output)

    # --------------------------

    # load weights
    weight_file = weight_utils.download_weights_if_necessary(
        file_name="timhalland_model_single_batch.h5", source_url=url
    )

    timhalland_model = weight_utils.load_model_weights(model=timhalland_model, weight_file=weight_file)

    return timhalland_model
