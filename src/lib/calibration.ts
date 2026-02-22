// Calibration Engine - Pixels Per Millimeter (PPM)

export interface CalibrationData {
  ppm: number; // pixels per millimeter
  referenceLength: number; // known real-world length in mm
  pixelLength: number; // measured pixel length
  isCalibrated: boolean;
  cellSizePx?: number; // analysis grid cell size in pixels (8-40, default 20)
}

export interface CalibrationLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function calculatePPM(line: CalibrationLine, realLengthMm: number): CalibrationData {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const pixelLength = Math.sqrt(dx * dx + dy * dy);
  const ppm = pixelLength / realLengthMm;

  return {
    ppm,
    referenceLength: realLengthMm,
    pixelLength,
    isCalibrated: true,
  };
}

export function pixelsToMm(pixels: number, ppm: number): number {
  return ppm > 0 ? pixels / ppm : pixels;
}

export function pixelsToMm2(pixelArea: number, ppm: number): number {
  return ppm > 0 ? pixelArea / (ppm * ppm) : pixelArea;
}

// Default calibration: assumes ~3.78 pixels per mm (96 DPI standard)
export const DEFAULT_CALIBRATION: CalibrationData = {
  ppm: 3.78,
  referenceLength: 25.4, // 1 inch = 25.4mm
  pixelLength: 96,
  isCalibrated: false,
  cellSizePx: 20,
};

// McCain template size chart reference sizes (in mm)
export const MCCAIN_SIZE_REFERENCE = {
  strip_width_standard: { min: 9, max: 9 }, // 3/8" = ~9.5mm
  strip_width_thin: { min: 6, max: 8 }, // 1/4" & 5/16" = 6-8mm
  strip_width_thick: { min: 11, max: 14 }, // 7/16" & 9/16"
  
  // Defect template sizes
  defect_dark_small: { diameter: 3, area_mm2: 7.1 },
  defect_dark_medium: { diameter: 5, area_mm2: 19.6 },
  defect_dark_large: { diameter: 10, area_mm2: 78.5 },
  defect_light_small: { diameter: 5, area_mm2: 19.6 },
  defect_light_medium: { diameter: 10, area_mm2: 78.5 },
  defect_light_large: { diameter: 12, area_mm2: 113.1 },
  
  // Sliver sizes
  sliver_1_4: { width: 6, height: 6 },
  sliver_3_8: { width: 9, height: 9 },
  sliver_7_16: { width: 11, height: 11 },
  sliver_9_16: { width: 14, height: 14 },
};
