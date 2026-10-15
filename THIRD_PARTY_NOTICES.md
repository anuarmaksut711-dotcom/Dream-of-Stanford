# Third-party notices

## DeepFace

- Original project: https://github.com/serengil/deepface
- Author: Sefik Ilkin Serengil and DeepFace contributors.
- Original copyright: Copyright (c) 2019 Sefik Ilkin Serengil.
- License: MIT; the original text is retained in `vendor/deepface-Timhalland/LICENSE`.
- Included source: the runtime Python package and selected packaging files from the owner-supplied `deepface-Timhalland-clean.zip`. The original archive SHA-256 is recorded in `UPSTREAMS.json`; an exact upstream Git commit was not supplied with that archive.
- Local changes: the original Race classifier is named Timhalland, with corresponding API keys, class names, display labels, documentation and tests. The project owner confirms this is a rename, not a newly trained model. Packaging for this release excludes upstream sample images, tests, icons, notebooks and model artifacts. The vendor README has been replaced with a source/attribution summary.
- The project does not claim authorship of the upstream models or endorsement by their authors.

DeepFace's original logo is credited upstream to **Adrien Coquet**, under **CC BY 3.0**: https://thenounproject.com/term/face-recognition/2965879/ and https://creativecommons.org/licenses/by/3.0/. That logo and the upstream `icon/` directory are not bundled in this release. This notice preserves the original attribution.

## Beard ViT

- Author/account: dima806.
- Source: https://huggingface.co/dima806/beard_face_image_detection
- Revision: `f13217aeacd0a42fee035b903681cbf7fdf1e1e7`.
- License declared by the author: Apache License 2.0; full text in `models/beard/LICENSE`.
- Base model credited by the original model card: `google/vit-base-patch16-224-in21k`.
- The original README, configuration and preprocessing configuration are retained without edits. The local manifest records source hashes. Model weights are not bundled; the download script fetches the pinned upstream revision for local use.
- No upstream NOTICE file is present in the root snapshot at that revision. These are this project's attribution notes, not a purported upstream NOTICE file.

## Fonts

- **Manrope** — Copyright 2018 The Manrope Project Authors (https://github.com/googlefonts/manrope). SIL Open Font License 1.1, retained in `web/fonts/OFL.txt`.
- **Literata** — Copyright 2017 The Literata Project Authors (https://github.com/googlefonts/literata). SIL Open Font License 1.1, retained in `web/fonts/Literata-OFL.txt`.

The bundled fonts retain their names and original license notices.

## Qaras graphics

`web/qaras-logo.png` is the Qaras logo generated for this project, according to the existing local generation record. `web/mark.svg` is the project's Q/eye mark. Neither is a redistributed DeepFace logo. The generation experiments and their other output files are not part of the source release.

## Model weights and runtime dependencies

The MIT license for this application's code does not relicense third-party weights, datasets, fonts or other artifacts. Python dependencies are installed separately and retain their own licenses; no virtual environment is distributed.

DeepFace wraps multiple independently licensed models. See the upstream license notes: https://github.com/serengil/deepface#licence . In particular, InsightFace's published pretrained recognition models, including Buffalo_L, are offered for **non-commercial research purposes** under its stated policy; obtain the appropriate permission before other use: https://github.com/deepinsight/insightface#license . Their presence as an application option does not grant a commercial license.

Timhalland is attributed to the original DeepFace Race implementation on the project owner's confirmation. No new training is claimed. Its local ONNX file is identified by hash in `models/timhalland/weights.json` but is not distributed, and its binary identity with an upstream release has not been independently verified. Renaming does not change applicable model or training-data terms.

## Excluded research data

No MAAD-Face annotations, VGGFace2 photographs, related collages or experiment exports are distributed in this release. Their local existence in the original workspace does not extend this project's MIT license to them. MAAD-Face's annotations are attributed to Fraunhofer IGD and licensed CC BY-SA 4.0; its authors expressly reserve image copyright to the original owners: https://github.com/pterhoer/MAAD-Face#license .
