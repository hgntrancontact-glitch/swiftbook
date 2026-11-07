# Local OCR resources

Tesseract.js worker and Tesseract.js Core are bundled from the versions pinned in package-lock.json.
English and Vietnamese fast language data were downloaded from:
- https://tessdata.projectnaptha.com/4.0.0_fast/eng.traineddata.gz
- https://tessdata.projectnaptha.com/4.0.0_fast/vie.traineddata.gz

Tesseract and its language data are distributed under Apache License 2.0.
OCR runs locally in a Web Worker. Document/image bytes are not uploaded.
