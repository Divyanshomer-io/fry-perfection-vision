// Color Analysis Engine V2 - Deep Sensory Vision
// Shadow-aware defect detection, CIE DE2000, FFT texture, Fuzzy PQI

import { 
  cieDe2000, detectWhiteBalance, applyWhiteBalance, 
  classifyShadow, computeNeighborVariance,
  estimateAcrylamideRisk, getContourWeight,
  type WhiteBalanceResult, type AcrylamideRisk
} from './cieDe2000';
import { analyzeTexture, type TextureAnalysis } from './fftAnalysis';
import { calculateFuzzyPQI, generateGradCAMData, type FuzzyPQIResult } from './fuzzyPQI';

export interface RGBColor { r: number; g: number; b: number; }
export interface HSVColor { h: number; s: number; v: number; }

export interface PixelStats {
  meanR: number; meanG: number; meanB: number;
  meanH: number; meanS: number; meanV: number;
  meanL: number; meanA: number; meanB_lab: number;
  medianHue: number;
  darkPixelRatio: number;
  burnedPixelRatio: number;
  lightPixelRatio: number;
  totalPixels: number;
  agtronScore: number;
  shadowPixelRatio: number;
}

export interface DefectRegion {
  x: number; y: number;
  width: number; height: number;
  type: 'dark' | 'burnt' | 'light' | 'mottled' | 'sugar_end' | 'disease' | 'shadow';
  severity: number;
  area: number;
  areamm2?: number;
  stripCoverage?: number;
  contourWeight?: number;
  contourPosition?: string;
  isShadow?: boolean;
  deltaE?: number; // CIE DE2000 from target
}

export interface AnalysisResult {
  pixelStats: PixelStats;
  usdaColorScore: number;
  usdaScoreLabel: string;
  processColorScore: number;
  hueScore: number;
  mottlingScore: number;
  defectScore: number;
  overallAppearanceScore: number;
  defects: DefectRegion[];
  pqi: number;
  defectCount: number;
  hueHistogram: number[];
  heatmapData: number[][];
  analysisTime: number;
  // V2 additions
  whiteBalance: WhiteBalanceResult;
  textureAnalysis: TextureAnalysis;
  fuzzyPQI: FuzzyPQIResult;
  acrylamideRisk: AcrylamideRisk;
  gradCAMData: number[][];
  shadowCount: number;
  meanDeltaE: number;
  v2Engine: boolean;
}

export function rgbToHsv(r: number, g: number, b: number): HSVColor {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0, s = 0;
  const v = max;
  if (delta > 0) {
    s = delta / max;
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  return { h, s, v };
}

export function rgbToLab(r: number, g: number, b: number): [number, number, number] {
  let rr = r / 255, gg = g / 255, bb = b / 255;
  rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92;
  gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92;
  bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92;
  const X = rr * 0.4124 + gg * 0.3576 + bb * 0.1805;
  const Y = rr * 0.2126 + gg * 0.7152 + bb * 0.0722;
  const Z = rr * 0.0193 + gg * 0.1192 + bb * 0.9505;
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
  const L = 116 * f(Y / 1.0) - 16;
  const a = 500 * (f(X / 0.9505) - f(Y / 1.0));
  const bVal = 200 * (f(Y / 1.0) - f(Z / 1.089));
  return [L, a, bVal];
}

function estimateAgtron(meanR: number, meanG: number, meanB: number): number {
  const luminance = 0.299 * meanR + 0.587 * meanG + 0.114 * meanB;
  return Math.round(20 + (luminance / 255) * 80);
}

function getUsdaScore(meanH: number, meanS: number, meanV: number, agtron: number): number {
  if (agtron >= 58 && agtron <= 68) return 0.5;
  if (agtron < 40) return 0.0;
  if (agtron < 50) return 0.2;
  if (agtron < 58) return 0.4;
  if (agtron < 70) return 0.6;
  if (agtron < 80) return 0.8;
  return 1.0;
}

function getProcessColorScore(usdaScore: number): { score: number; label: string } {
  const deviation = Math.abs(usdaScore - 0.5);
  if (deviation < 0.05) return { score: 5, label: 'Equal to Target' };
  if (usdaScore < 0.5) {
    if (deviation < 0.15) return { score: 4, label: 'Slightly Dark' };
    if (deviation < 0.25) return { score: 3, label: 'Moderately Dark' };
    if (deviation < 0.35) return { score: 2, label: 'Very Dark - Quality Failure' };
    return { score: 1, label: 'Extremely Dark - Not McDonald\'s Quality' };
  } else {
    if (deviation < 0.15) return { score: 6, label: 'Slightly Light' };
    if (deviation < 0.25) return { score: 7, label: 'Moderately Light' };
    if (deviation < 0.35) return { score: 8, label: 'Very Light - Quality Failure' };
    return { score: 9, label: 'Extremely Light - Not McDonald\'s Quality' };
  }
}

function getHueScore(meanH: number, meanS: number): { score: number; label: string } {
  if (meanH >= 25 && meanH <= 40 && meanS > 0.3 && meanS < 0.6)
    return { score: 5, label: 'Bright Light Golden (Target)' };
  if (meanH > 40 && meanH <= 55) return { score: 6, label: 'Creamy Yellow' };
  if (meanH > 55 && meanH <= 70) return { score: 7, label: 'Yellow Flesh' };
  if (meanH > 70 || meanS > 0.7) return { score: 8, label: 'Strong Yellow - Large Difference' };
  if (meanH < 20 || meanH > 80) return { score: 9, label: 'Bright Yellow / Off-Color' };
  if (meanH >= 20 && meanH < 25) return { score: 4, label: 'Slightly Under-colored' };
  return { score: 5, label: 'Bright Light Golden (Target)' };
}

/**
 * V2 Shadow-Aware Defect Detection with CIE DE2000 and Contour Weighting
 */
export function detectDefects(
  imageData: ImageData, ppm: number = 1, wb: WhiteBalanceResult | null = null
): { defects: DefectRegion[]; shadowCount: number } {
  const { data, width, height } = imageData;
  const defects: DefectRegion[] = [];
  const cellSize = 20;
  const gridW = Math.ceil(width / cellSize);
  const gridH = Math.ceil(height / cellSize);
  
  // Build HSV + RGB grid with white balance correction
  const hsvGrid: (HSVColor & { r: number; g: number; b: number })[][] = [];
  const validGrid: boolean[][] = [];

  for (let gy = 0; gy < gridH; gy++) {
    hsvGrid[gy] = [];
    validGrid[gy] = [];
    for (let gx = 0; gx < gridW; gx++) {
      let totalH = 0, totalS = 0, totalV = 0;
      let totalR = 0, totalG = 0, totalB = 0;
      let count = 0;

      for (let py = gy * cellSize; py < Math.min((gy + 1) * cellSize, height); py++) {
        for (let px = gx * cellSize; px < Math.min((gx + 1) * cellSize, width); px++) {
          const idx = (py * width + px) * 4;
          let r = data[idx], g = data[idx + 1], b = data[idx + 2];
          const a = data[idx + 3];
          if (a < 128) continue;
          
          // Apply white balance
          if (wb) {
            [r, g, b] = applyWhiteBalance(r, g, b, wb);
          }
          
          const hsv = rgbToHsv(r, g, b);
          if (hsv.s > 0.08 && hsv.v > 0.08) {
            totalH += hsv.h; totalS += hsv.s; totalV += hsv.v;
            totalR += r; totalG += g; totalB += b;
            count++;
          }
        }
      }

      if (count > 0) {
        hsvGrid[gy][gx] = { 
          h: totalH / count, s: totalS / count, v: totalV / count,
          r: totalR / count, g: totalG / count, b: totalB / count
        };
        validGrid[gy][gx] = true;
      } else {
        hsvGrid[gy][gx] = { h: 0, s: 0, v: 0, r: 0, g: 0, b: 0 };
        validGrid[gy][gx] = false;
      }
    }
  }

  // Calculate mean values
  let sumH = 0, sumS = 0, sumV = 0, sumR = 0, sumG = 0, sumB = 0, validCount = 0;
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      if (validGrid[gy][gx]) {
        sumH += hsvGrid[gy][gx].h; sumS += hsvGrid[gy][gx].s; sumV += hsvGrid[gy][gx].v;
        sumR += hsvGrid[gy][gx].r; sumG += hsvGrid[gy][gx].g; sumB += hsvGrid[gy][gx].b;
        validCount++;
      }
    }
  }
  const meanH = validCount > 0 ? sumH / validCount : 30;
  const meanS = validCount > 0 ? sumS / validCount : 0.5;
  const meanV = validCount > 0 ? sumV / validCount : 0.7;
  const meanR = validCount > 0 ? sumR / validCount : 128;
  const meanG = validCount > 0 ? sumG / validCount : 100;
  const meanB = validCount > 0 ? sumB / validCount : 60;

  // Target golden color in Lab for DE2000
  const [targetL, targetA, targetB_lab] = [70, 8, 40];
  let shadowCount = 0;

  // Detect defects with shadow classification
  for (let gy = 0; gy < gridH; gy++) {
    for (let gx = 0; gx < gridW; gx++) {
      if (!validGrid[gy][gx]) continue;
      const cell = hsvGrid[gy][gx];
      const vDiff = meanV - cell.v;
      const hDiff = Math.abs(meanH - cell.h);
      
      // Shadow classification
      const neighborVar = computeNeighborVariance(hsvGrid, validGrid, gy, gx, gridH, gridW);
      const shadowResult = classifyShadow(
        cell.h, cell.s, cell.v, cell.r, cell.g, cell.b,
        meanH, meanS, meanV, meanR, meanG, meanB,
        neighborVar
      );
      
      if (shadowResult.isShadow && shadowResult.confidence > 0.5) {
        shadowCount++;
        continue; // Skip shadows - don't mark as defects!
      }
      
      // CIE DE2000 distance from cell to target golden
      const [cellL, cellA, cellB_l] = rgbToLab(cell.r, cell.g, cell.b);
      const deltaE = cieDe2000(cellL, cellA, cellB_l, targetL, targetA, targetB_lab);

      let defectType: DefectRegion['type'] | null = null;
      let severity = 0;

      // Use DE2000 + HSV for classification
      if (cell.v < 0.2 && cell.s < 0.3 && deltaE > 30) {
        defectType = 'burnt';
        severity = Math.min(1, deltaE / 50);
      } else if (vDiff > 0.25 && cell.s > 0.2 && deltaE > 20) {
        defectType = 'dark';
        severity = Math.min(1, vDiff * (deltaE / 40));
      } else if (cell.v > 0.85 && cell.s < 0.25 && deltaE > 15) {
        defectType = cell.h < 20 ? 'sugar_end' : 'light';
        severity = Math.min(1, (cell.v - 0.85) * 4 * (deltaE / 30));
      } else if (hDiff > 30 && vDiff > 0.1 && deltaE > 15) {
        defectType = 'mottled';
        severity = Math.min(1, (hDiff / 60) * (deltaE / 30));
      } else if (deltaE > 35 && (cell.h > 80 || cell.h < 10)) {
        defectType = 'disease';
        severity = Math.min(1, deltaE / 50);
      }

      if (defectType && severity > 0.12) {
        const x = gx * cellSize, y = gy * cellSize;
        const w = Math.min(cellSize, width - x);
        const h = Math.min(cellSize, height - y);
        const area = w * h;
        const areamm2 = ppm > 0 ? area / (ppm * ppm) : area;
        
        // Contour-weighted scoring
        const contour = getContourWeight(x, y, w, h, width, height);

        defects.push({
          x, y, width: w, height: h,
          type: defectType,
          severity: Math.min(1, severity * contour.weight),
          area, areamm2,
          stripCoverage: 0,
          contourWeight: contour.weight,
          contourPosition: contour.position,
          isShadow: false,
          deltaE,
        });
      }
    }
  }

  return { defects: mergeAndFilterDefects(defects, width), shadowCount };
}

function mergeAndFilterDefects(defects: DefectRegion[], imageWidth: number): DefectRegion[] {
  if (defects.length === 0) return [];
  const sorted = [...defects].sort((a, b) => a.x - b.x);
  const stripGroups = new Map<number, DefectRegion[]>();
  for (const d of sorted) {
    const stripKey = Math.round(d.y / 30);
    if (!stripGroups.has(stripKey)) stripGroups.set(stripKey, []);
    stripGroups.get(stripKey)!.push(d);
  }
  const result: DefectRegion[] = [];
  for (const [, group] of stripGroups) {
    let defectWidth = 0;
    for (const d of group) defectWidth += d.width;
    const stripCoverage = defectWidth / imageWidth;
    for (const d of group) {
      d.stripCoverage = stripCoverage;
      if (d.type === 'mottled' && stripCoverage < 0.333) continue;
      result.push(d);
    }
  }
  return result;
}

export function generateHueHistogram(imageData: ImageData, wb: WhiteBalanceResult | null = null): number[] {
  const { data, width, height } = imageData;
  const bins = new Array(36).fill(0);
  let total = 0;
  for (let i = 0; i < width * height; i++) {
    let r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const a = data[i * 4 + 3];
    if (a < 128) continue;
    if (wb) [r, g, b] = applyWhiteBalance(r, g, b, wb);
    const hsv = rgbToHsv(r, g, b);
    if (hsv.s > 0.1 && hsv.v > 0.15) {
      bins[Math.min(35, Math.floor(hsv.h / 10))]++;
      total++;
    }
  }
  if (total > 0) for (let i = 0; i < bins.length; i++) bins[i] = (bins[i] / total) * 100;
  return bins;
}

export function generateHeatmap(
  imageData: ImageData, gridSize = 20, wb: WhiteBalanceResult | null = null
): number[][] {
  const { data, width, height } = imageData;
  const gW = Math.ceil(width / gridSize);
  const gH = Math.ceil(height / gridSize);
  const heatmap: number[][] = [];

  // Pre-compute mean RGB for shadow detection
  let totalR = 0, totalG = 0, totalB = 0, pxCount = 0;
  for (let i = 0; i < width * height; i += 4) {
    let r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    if (data[i * 4 + 3] < 128) continue;
    if (wb) [r, g, b] = applyWhiteBalance(r, g, b, wb);
    totalR += r; totalG += g; totalB += b; pxCount++;
  }
  const mR = pxCount > 0 ? totalR / pxCount : 128;
  const mG = pxCount > 0 ? totalG / pxCount : 100;
  const mB = pxCount > 0 ? totalB / pxCount : 60;
  const meanHSV = rgbToHsv(mR, mG, mB);

  for (let gy = 0; gy < gH; gy++) {
    heatmap[gy] = [];
    for (let gx = 0; gx < gW; gx++) {
      let sumBurn = 0, count = 0;
      let cellR = 0, cellG_c = 0, cellB_c = 0, cellCount = 0;
      
      for (let py = gy * gridSize; py < Math.min((gy + 1) * gridSize, height); py++) {
        for (let px = gx * gridSize; px < Math.min((gx + 1) * gridSize, width); px++) {
          const idx = (py * width + px) * 4;
          let r = data[idx], g = data[idx + 1], b = data[idx + 2];
          const a = data[idx + 3];
          if (a < 128) continue;
          if (wb) [r, g, b] = applyWhiteBalance(r, g, b, wb);
          
          cellR += r; cellG_c += g; cellB_c += b; cellCount++;
          const hsv = rgbToHsv(r, g, b);
          if (hsv.s > 0.05 || hsv.v < 0.5) {
            sumBurn += 1 - hsv.v;
            count++;
          }
        }
      }
      
      if (count > 0 && cellCount > 0) {
        // Shadow check: is this cell just shadowed?
        const avgR = cellR / cellCount, avgG = cellG_c / cellCount, avgB_c = cellB_c / cellCount;
        const cellHSV = rgbToHsv(avgR, avgG, avgB_c);
        
        // Quick shadow test: RGB ratios preserved + hue close to mean
        const ratioRG_mean = mG > 0 ? mR / mG : 1;
        const ratioRG_cell = avgG > 0 ? avgR / avgG : 1;
        let hueDiff = Math.abs(cellHSV.h - meanHSV.h);
        if (hueDiff > 180) hueDiff = 360 - hueDiff;
        const isShadow = Math.abs(ratioRG_mean - ratioRG_cell) < 0.25 && hueDiff < 15 && 
                         (meanHSV.v - cellHSV.v) > 0.1 && (meanHSV.v - cellHSV.v) < 0.5;
        
        // Reduce shadow intensity in heatmap
        heatmap[gy][gx] = isShadow ? (sumBurn / count) * 0.15 : sumBurn / count;
      } else {
        heatmap[gy][gx] = 0;
      }
    }
  }
  return heatmap;
}

// Main analysis function - V2 Pipeline
export async function analyzeImage(imageData: ImageData, ppm: number = 1): Promise<AnalysisResult> {
  const start = Date.now();
  const { data, width, height } = imageData;

  // Phase 1: White Balance Normalization
  const whiteBalance = detectWhiteBalance(imageData);

  let totalR = 0, totalG = 0, totalB = 0;
  let totalH = 0, totalS = 0, totalV = 0;
  let totalL = 0, totalA_lab = 0, totalB_lab = 0;
  let darkPixels = 0, burnedPixels = 0, lightPixels = 0;
  const hueValues: number[] = [];
  let validPixels = 0;
  let shadowPixels = 0;

  for (let i = 0; i < width * height; i++) {
    let r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const a = data[i * 4 + 3];
    if (a < 128) continue;

    // Apply white balance correction
    [r, g, b] = applyWhiteBalance(r, g, b, whiteBalance);

    const hsv = rgbToHsv(r, g, b);
    if (hsv.s < 0.05 && hsv.v > 0.9) continue;

    const [L, a_lab, b_lab] = rgbToLab(r, g, b);

    totalR += r; totalG += g; totalB += b;
    totalH += hsv.h; totalS += hsv.s; totalV += hsv.v;
    totalL += L; totalA_lab += a_lab; totalB_lab += b_lab;
    validPixels++;

    if (hsv.s > 0.1) hueValues.push(hsv.h);
    if (hsv.v < 0.2 && hsv.s < 0.3) burnedPixels++;
    else if (hsv.v < 0.35) darkPixels++;
    else if (hsv.v > 0.85 && hsv.s < 0.2) lightPixels++;
  }

  if (validPixels === 0) validPixels = 1;

  const meanR = totalR / validPixels;
  const meanG = totalG / validPixels;
  const meanB = totalB / validPixels;
  const meanH = totalH / validPixels;
  const meanS = totalS / validPixels;
  const meanV = totalV / validPixels;
  const meanL = totalL / validPixels;
  const meanA = totalA_lab / validPixels;
  const meanB_lab = totalB_lab / validPixels;

  hueValues.sort((a, b) => a - b);
  const medianHue = hueValues.length > 0 ? hueValues[Math.floor(hueValues.length / 2)] : 30;

  const agtronScore = estimateAgtron(meanR, meanG, meanB);
  const usdaColorScore = getUsdaScore(meanH, meanS, meanV, agtronScore);
  const { score: processColorScore } = getProcessColorScore(usdaColorScore);
  const { score: hueScore } = getHueScore(meanH, meanS);

  // Phase 2: Shadow-aware defect detection
  const { defects, shadowCount } = detectDefects(imageData, ppm, whiteBalance);
  const defectCount = defects.filter(d => !d.isShadow).length;
  const burnedRatio = burnedPixels / validPixels;
  const darkRatio = darkPixels / validPixels;

  // Mottling & defect scores (adjusted for shadow filtering)
  const realDefects = defects.filter(d => !d.isShadow);
  const mottledDefects = realDefects.filter(d => d.type === 'mottled' || d.type === 'dark');
  let mottlingScore = 5;
  if (mottledDefects.length >= 20) mottlingScore = 9;
  else if (mottledDefects.length >= 15) mottlingScore = 8;
  else if (mottledDefects.length >= 10) mottlingScore = 7;
  else if (mottledDefects.length >= 5) mottlingScore = 6;

  let defectScore = 5;
  if (burnedRatio > 0.3 || defectCount > 20) defectScore = 9;
  else if (burnedRatio > 0.2 || defectCount > 15) defectScore = 8;
  else if (burnedRatio > 0.1 || defectCount > 10) defectScore = 7;
  else if (burnedRatio > 0.05 || defectCount > 5) defectScore = 6;

  const overallAppearanceScore = Math.max(processColorScore, hueScore, mottlingScore, defectScore);

  // Phase 3: FFT Texture Analysis
  const textureAnalysis = analyzeTexture(imageData);

  // Phase 4: Fuzzy Logic PQI
  const fuzzyPQI = calculateFuzzyPQI(processColorScore, hueScore, mottlingScore, defectScore);

  // Acrylamide Risk Estimation
  const acrylamideRisk = estimateAcrylamideRisk(meanL, meanA, meanB_lab, burnedRatio);

  // CIE DE2000 mean distance from target golden
  const meanDeltaE = cieDe2000(meanL, meanA, meanB_lab, 70, 8, 40);

  // Heatmap + Grad-CAM
  const hueHistogram = generateHueHistogram(imageData, whiteBalance);
  const heatmapData = generateHeatmap(imageData, 20, whiteBalance);
  const gradCAMData = generateGradCAMData(heatmapData, defects, 20);

  const usdaLabel = getUsdaLabel(usdaColorScore);

  return {
    pixelStats: {
      meanR, meanG, meanB,
      meanH, meanS, meanV,
      meanL, meanA, meanB_lab: meanB_lab,
      medianHue,
      darkPixelRatio: darkRatio,
      burnedPixelRatio: burnedRatio,
      lightPixelRatio: lightPixels / validPixels,
      totalPixels: validPixels,
      agtronScore,
      shadowPixelRatio: shadowCount / Math.max(1, validPixels / 400),
    },
    usdaColorScore, usdaScoreLabel: usdaLabel,
    processColorScore, hueScore, mottlingScore, defectScore,
    overallAppearanceScore,
    defects: realDefects,
    pqi: fuzzyPQI.pqi,
    defectCount,
    hueHistogram, heatmapData,
    analysisTime: Date.now() - start,
    whiteBalance, textureAnalysis, fuzzyPQI,
    acrylamideRisk, gradCAMData,
    shadowCount, meanDeltaE,
    v2Engine: true,
  };
}

function getUsdaLabel(score: number): string {
  if (score <= 0.1) return 'Very Dark (>1.5 USDA)';
  if (score <= 0.3) return 'Dark (1.0-1.5 USDA)';
  if (score <= 0.45) return 'Slightly Dark (0.5-1.0 USDA)';
  if (score <= 0.55) return 'Target (0.5 USDA) ✓';
  if (score <= 0.7) return 'Slightly Light (0.5-1.0 USDA)';
  if (score <= 0.9) return 'Light (1.0-1.5 USDA)';
  return 'Very Light (>1.5 USDA)';
}

export function calculatePQI(scores: number[]): number {
  if (scores.length === 0) return 100;
  if (scores.some(s => s === 1 || s === 9)) return 0;
  if (scores.some(s => s === 2 || s === 8)) return 25;
  const n = scores.length;
  const furthest = scores.reduce((a, b) => Math.abs(a - 5) >= Math.abs(b - 5) ? a : b);
  const deviation = Math.abs(furthest - 5);
  let basePct = 100;
  if (deviation === 1) basePct = 85;
  else if (deviation === 2) basePct = 60;
  else if (deviation >= 3) basePct = 25;
  const numFives = scores.filter(s => s === 5).length;
  const bonus = n > 1 ? (numFives / (n - 1)) * 10 : 0;
  return Math.min(100, Math.round(basePct + bonus));
}

export function getPQIStatus(pqi: number): { label: string; color: string; level: 'pass' | 'warn' | 'fail' | 'critical' } {
  if (pqi >= 90) return { label: 'EXCELLENT', color: 'hsl(142 70% 45%)', level: 'pass' };
  if (pqi >= 75) return { label: 'PASS', color: 'hsl(142 60% 40%)', level: 'pass' };
  if (pqi >= 60) return { label: 'MARGINAL', color: 'hsl(42 95% 52%)', level: 'warn' };
  if (pqi >= 25) return { label: 'FAIL', color: 'hsl(25 90% 50%)', level: 'fail' };
  if (pqi > 0) return { label: 'QUALITY FAILURE', color: 'hsl(0 75% 55%)', level: 'critical' };
  return { label: 'REJECTED', color: 'hsl(0 75% 40%)', level: 'critical' };
}

export function getMcdonaldsScoreLabel(score: number): string {
  const labels: Record<number, string> = {
    1: 'Extremely Different (Less)', 2: 'Large Difference (Less)',
    3: 'Moderate Difference (Less)', 4: 'Slight Difference (Less)',
    5: 'Matches Target ✓', 6: 'Slight Difference (More)',
    7: 'Moderate Difference (More)', 8: 'Large Difference (More)',
    9: 'Not McDonald\'s Quality',
  };
  return labels[score] || 'Unknown';
}
