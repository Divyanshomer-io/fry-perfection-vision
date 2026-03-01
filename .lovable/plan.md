

# Plan: Instance Segmentation Pipeline & Build Fix

## 1. Build Error Fix (chart.tsx)

Line 193 passes `item.payload` (type `Record<string, unknown>`) where the formatter expects `ChartTooltipPayloadItem[]`. Fix: pass the outer `payload` array instead of `item.payload`.

## 2. Four-Stage Segmentation State Machine

### Architecture

The `ImageAnalyzer` component will be refactored into a linear state machine with four stages:

```text
UPLOAD → SEGMENTATION → VALIDATION (user gate) → ANALYSIS
```

- **Stage 1 (Segmentation)**: On image upload, the system automatically segments fry instances using a pure-Canvas CV pipeline (no TensorFlow.js — not feasible for client-side UNet without pre-trained weights and a 100MB+ model download). Instead, we implement a robust classical pipeline:
  - Convert to **LAB color space**, isolate L-channel
  - Apply **CLAHE** (Contrast Limited Adaptive Histogram Equalization) for edge gradient maximization
  - **Adaptive thresholding** to separate fry from background
  - **Morphological operations** (open/close/erode) to clean noise
  - **Distance Transform + Watershed** to split touching fries
  - **Contour extraction** with smoothing (Teh-Chin L1 approximation equivalent)
  - **Non-fry filtering**: reject contours with square aspect ratio or very small area

- **Stage 2 (User Validation Gate)**: Display the original image with detected contour borders overlaid in cyan/green. User sees "Confirm Borders" and "Re-detect" buttons. No analysis runs until confirmed.

- **Stage 3 (Blackout Masking)**: On confirmation, generate a binary alpha mask from contours. Apply bitwise AND — everything outside borders becomes RGB(0,0,0). The masked image replaces the analysis input.

- **Stage 4 (Pure Analysis)**: The existing `analyzeImage()` runs on the masked image. All pixels at (0,0,0) are skipped by the existing `hsv.v < 0.18` background filter, ensuring zero false positives from shadows or background.

### New Files

- **`src/lib/segmentation.ts`**: Contains the full segmentation pipeline:
  - `segmentFries(imageData)` → returns array of contour point arrays
  - CLAHE implementation (tile-based histogram equalization with clip limiting)
  - Adaptive threshold on L-channel
  - Distance transform + local maxima detection
  - Watershed-style region growing
  - Morphological erosion (3x3 kernel, 2 iterations) for shadow buffer
  - Contour smoothing and filtering (min area, aspect ratio rejection)
  - `applyMask(imageData, contours)` → returns masked ImageData with black background

### Modified Files

- **`src/components/ImageAnalyzer.tsx`**: Add state machine (`stage: 'upload' | 'segmented' | 'analyzing'`). After upload, run segmentation and show contour overlay. Add "Confirm Borders" / "Clear" buttons as a gate. On confirm, apply mask then run analysis.

- **`src/components/ui/chart.tsx`**: Fix line 193 type error — change `item.payload` to `payload`.

### UI for Validation Gate

When in "segmented" stage:
- Original image with colored contour overlays (each fry instance gets a distinct color)
- Info bar showing "X fry instances detected"
- Two buttons: **"CONFIRM & ANALYZE"** (proceeds to Stage 3+4) and **"RESET"** (back to upload)
- The existing analysis overlay, heatmap, and defect detection only activate after confirmation

### Shadow Handling

The 2-pixel morphological erosion inward from each contour edge creates a physical buffer zone that excludes edge shadows from analysis. Combined with the blackout mask, the background (trays, paper, shadows between fries) is completely eliminated before any color/defect logic runs.

