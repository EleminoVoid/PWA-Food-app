# ONNX Segmentation Integration Handoff

This document explains the ONNX Runtime Web segmentation work added to the PWA. It is written as a porting guide for adding the same YOLO/RF-DETR browser inference flow to another app.

## What Changed

The app no longer uses the old hardcoded nutrition/classification stub. It now runs local ONNX instance segmentation in the browser/PWA with:

- YOLO segmentation model support.
- RF-DETR segmentation model support.
- A model switcher in the UI.
- Separate preprocessing paths for YOLO and RF-DETR.
- Segmentation mask overlay rendering.
- Bounding boxes and labels.
- JSON output with boxes and sampled mask boundary points.
- Service-worker caching for model assets.

The removed placeholder fields were:

```ts
calories
protein
carbs
fat
```

The app now stores/display segmentation results instead of nutrition estimates.

## Main Files

### React UI

`src/App.tsx`

This is the main app UI and scan flow. Important responsibilities:

- Tracks selected model: `yolo` or `rfdetr`.
- Shows model switcher and threshold controls.
- Handles camera capture and image upload.
- Calls `runSegmentation(...)`.
- Draws the segmentation overlay to a hidden canvas.
- Saves recent scan history in `localStorage`.
- Displays result cards, JSON output, and full-preview modal.

Important functions:

- `fileToDataUrl(file)`
  - Reads uploaded image without resizing or JPEG recompression.
  - This was important so the PWA matches the demo behavior more closely.

- `analyzeImage(imageDataUrl, source)`
  - Runs ONNX inference.
  - Draws masks/boxes.
  - Stores result in history.

- `ResultCard`
  - Shows overlay preview, top label, detections, and JSON.

- `FullPreviewModal`
  - Opens the overlay preview inside the app instead of opening a raw `data:image/...` tab.

### Extra UI Styling

`src/segmentation.css`

Contains styles specifically for the ONNX segmentation additions:

- model switcher
- confidence/IoU controls
- detection list
- result JSON block
- larger image preview
- full-preview modal

The existing `src/App.css` remains the main app styling.

## Inference Files

All inference code lives in:

```text
src/inference/
```

### `src/inference/types.ts`

Shared TypeScript types:

- `ModelId`
- `ModelMetadata`
- `ImageInput`
- `SegmentDetection`
- `SegmentResult`
- `RunOptions`

### `src/inference/models.ts`

Defines the model choices shown in the UI:

```ts
export const MODEL_OPTIONS = [
  {
    id: 'yolo',
    label: 'YOLO Seg',
    metadataUrl: '/models/yolo/metadata.json',
  },
  {
    id: 'rfdetr',
    label: 'RF-DETR Seg',
    metadataUrl: '/models/rfdetr/metadata.json',
  },
]
```

To add another model, add another entry here and implement/route its decoder.

### `src/inference/segmentation.ts`

Main ONNX Runtime Web loader/runner.

Responsibilities:

- Imports `onnxruntime-web/webgpu`.
- Configures WASM fallback paths using Vite `?url` imports.
- Loads model metadata.
- Creates ONNX Runtime sessions.
- Tries WebGPU first, then falls back to WASM.
- Routes inference to YOLO or RF-DETR decoder.

Important detail:

```ts
ort.env.wasm.wasmPaths = {
  mjs: wasmMjsUrl,
  wasm: wasmBinaryUrl,
}
```

This avoids the common browser error where ONNX Runtime tries to fetch `/ort/ort-wasm-simd-threaded.mjs`.

### `src/inference/image.ts`

Image preprocessing and overlay drawing.

Preprocessing:

- YOLO uses letterbox resize to `640x640`.
- RF-DETR uses direct resize to `504x504`.

Overlay rendering:

- Draws original image.
- Draws mask fill.
- Draws bounding boxes and labels.

Important note:

The sampled boundary points are kept in JSON but are not connected as lines on the preview. Connecting unordered mask boundary points created unreadable spiderweb lines.

### `src/inference/yoloSeg.ts`

YOLO segmentation decoder.

This model exports compact ONNX output:

```text
output0: [1, 300, 38]
output1: [1, 32, 160, 160]
```

For compact output each prediction row is:

```text
[x1, y1, x2, y2, confidence, classId, maskCoeff...]
```

Important fix:

The decoder must detect compact output using:

```ts
compactChannels = 6 + maskDim
```

Do not assume:

```ts
names.length + 6
```

That caused class IDs like `62` to be interpreted as confidence `62.0`, producing nonsense such as `6200%`.

### `src/inference/rfdetrSeg.ts`

RF-DETR segmentation decoder.

The tested RF-DETR ONNX output shape was:

```text
input:  [1, 3, 504, 504]
dets:   [1, 200, 4]
labels: [1, 200, 64]
masks:  [1, 200, 126, 126]
```

The decoder:

- Finds boxes, score/class tensor, and masks by output name/shape.
- Applies sigmoid to class logits.
- Selects the best class per query.
- Scales boxes back to original image size.
- Applies NMS.

### `src/inference/postprocess.ts`

Shared helpers:

- sigmoid
- clamp
- NMS
- IoU
- box scaling
- mask boundary point sampling

## Model Assets

Model files live in:

```text
public/models/
```

Current layout:

```text
public/models/yolo/best.onnx
public/models/yolo/metadata.json
public/models/rfdetr/rfdetr.onnx
public/models/rfdetr/metadata.json
```

Approximate model sizes:

- YOLO ONNX: about 112 MB.
- RF-DETR ONNX: about 139 MB.

These files are served as static assets by Vite.

## Metadata Format

Each model folder needs a `metadata.json`.

YOLO example:

```json
{
  "modelType": "yolo-seg",
  "modelFile": "best.onnx",
  "task": "segment",
  "imgsz": 640,
  "names": ["class_0", "class_1"]
}
```

RF-DETR example:

```json
{
  "modelType": "rfdetr-seg",
  "modelFile": "rfdetr.onnx",
  "task": "segment",
  "imgsz": 504,
  "names": ["class_0", "class_1"],
  "preprocess": {
    "resize": "direct",
    "mean": [0.485, 0.456, 0.406],
    "std": [0.229, 0.224, 0.225],
    "layout": "NCHW"
  }
}
```

## Preprocessing Rules

The two models do not use the same preprocessing.

### YOLO

Implemented in `preprocessLetterbox(...)`.

Steps:

1. Decode the uploaded/captured image.
2. Create a square `640x640` canvas.
3. Fill canvas with gray `rgb(114, 114, 114)`.
4. Resize image while preserving aspect ratio.
5. Center it with padding.
6. Convert RGB pixels to `NCHW`.
7. Normalize to `[0, 1]`.

### RF-DETR

Implemented in `preprocessDirect(...)`.

Steps:

1. Decode image.
2. Directly resize to `504x504`.
3. Convert RGB pixels to `NCHW`.
4. Normalize with ImageNet values:

```ts
mean = [0.485, 0.456, 0.406]
std = [0.229, 0.224, 0.225]
```

## Upload And Camera Handling

Uploads are read using `FileReader.readAsDataURL(file)`.

This avoids resizing/recompressing the uploaded image before inference. Earlier versions redrew the file to canvas and exported JPEG, which changed model confidence compared with the standalone demo.

Camera captures use:

```ts
canvas.toDataURL('image/png')
```

This avoids lossy JPEG compression before inference.

The overlay result is still saved as JPEG to keep local history smaller:

```ts
canvas.toDataURL('image/jpeg', 0.86)
```

## Confidence Display

The raw model score is a decimal:

```text
0.3479
```

The demo showed this rounded:

```text
0.35
```

The PWA now shows both:

```text
0.35 (34.8%)
```

The JSON keeps the more precise value:

```json
"confidence": 0.3479
```

## Service Worker / PWA Caching

Service worker file:

```text
src/sw.ts
```

Changes:

- Added explicit model cache:

```ts
const MODEL_CACHE = `${CACHE_PREFIX}-models-v1`
```

- Added model URLs:

```ts
const MODEL_CACHE_URLS = [
  '/models/yolo/metadata.json',
  '/models/yolo/best.onnx',
  '/models/rfdetr/metadata.json',
  '/models/rfdetr/rfdetr.onnx',
]
```

- `.onnx`, `.wasm`, and `.mjs` runtime/model assets are cached in the model cache.

Important PWA note:

When testing model or service-worker changes, the browser may keep old cached assets. If behavior looks stale, clear:

```text
DevTools -> Application -> Service Workers -> Unregister
DevTools -> Application -> Storage -> Clear site data
```

Then hard refresh.

## Dependency Added

`package.json` now includes:

```json
"onnxruntime-web": "^1.26.0"
```

Install command:

```bash
npm install onnxruntime-web
```

## How To Run

Development:

```bash
npm run dev
```

Production/PWA test:

```bash
npm run build
npm run preview
```

Validation commands used after changes:

```bash
npm run lint
npm run build
```

Both should pass.

## Porting Checklist For Another App

1. Install ONNX Runtime Web:

```bash
npm install onnxruntime-web
```

2. Copy model assets:

```text
public/models/yolo/best.onnx
public/models/yolo/metadata.json
public/models/rfdetr/rfdetr.onnx
public/models/rfdetr/metadata.json
```

3. Copy inference folder:

```text
src/inference/
```

4. Make sure the app calls:

```ts
runSegmentation(modelId, imageDataUrl, {
  confidenceThreshold,
  iouThreshold,
})
```

5. Draw overlay with:

```ts
drawSegmentationOverlay(canvas, input, result.detections)
```

6. Add UI to choose:

```ts
'yolo'
'rfdetr'
```

7. Preserve model-specific preprocessing:

- YOLO: letterbox to 640.
- RF-DETR: direct resize to 504 with ImageNet normalization.

8. Add service-worker caching for:

```text
*.onnx
*.wasm
*.mjs
/models/**/metadata.json
```

9. Test with the exact same uploaded image in both apps.

10. Clear service-worker cache when switching or replacing models.

## Common Issues

### Browser says no available backend

Usually ONNX Runtime cannot find its WASM files. Use Vite `?url` imports like `src/inference/segmentation.ts`.

### YOLO shows 6000% confidence

The decoder is reading `classId` as confidence. Make sure compact output is parsed as:

```text
[x1, y1, x2, y2, confidence, classId, maskCoeff...]
```

### PWA differs from demo confidence

Check whether the app resized or recompressed the image before inference. Uploads should use the original file data URL.

### Old model keeps loading

Clear service-worker storage and site data.

### Mask overlay has weird lines

Do not draw sampled boundary points as a connected polygon unless they are contour-ordered. Keep points in JSON, but render the mask as a filled overlay.

## Files Changed In This Repo

Core changed/added files:

```text
package.json
package-lock.json
src/App.tsx
src/segmentation.css
src/sw.ts
src/inference/types.ts
src/inference/models.ts
src/inference/segmentation.ts
src/inference/image.ts
src/inference/yoloSeg.ts
src/inference/rfdetrSeg.ts
src/inference/postprocess.ts
public/models/yolo/best.onnx
public/models/yolo/metadata.json
public/models/rfdetr/rfdetr.onnx
public/models/rfdetr/metadata.json
```

Also cleaned the old Svelte stub:

```text
svelte-app/src/App.svelte
```

That file previously documented a fake `Green Apple` nutrition result. It now no longer references calories/protein/carbs/fat as the intended ONNX output.
