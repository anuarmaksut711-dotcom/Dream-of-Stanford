---
license: apache-2.0
metrics:
- accuracy
- f1
base_model:
- google/vit-base-patch16-224-in21k
---
Predicts the presence of a beard given a facial image.

See https://www.kaggle.com/code/dima806/beard-face-image-detection-vit for more details.

```
Classification report:

              precision    recall  f1-score   support

       Beard     1.0000    1.0000    1.0000        34
    No Beard     1.0000    1.0000    1.0000        34

    accuracy                         1.0000        68
   macro avg     1.0000    1.0000    1.0000        68
weighted avg     1.0000    1.0000    1.0000        68
```