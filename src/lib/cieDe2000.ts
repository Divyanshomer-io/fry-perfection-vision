// CIE DE2000 Color Difference Engine + Spatial White Balance + Shadow Classifier
// Implements perceptually uniform color comparison for food quality analysis

/**
 * CIE DE2000 (ΔE₀₀) - The gold standard for perceptual color difference
 * Accounts for L*, a*, b* weightings and human visual sensitivity
 */
export function cieDe2000(
  L1: number, a1: number, b1: number,
  L2: number, a2: number, b2: number,
  kL = 1, kC = 1, kH = 1
): number {
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;

  // Step 1: Calculate C'ab, h'ab
  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cab = (C1 + C2) / 2;
  const Cab7 = Math.pow(Cab, 7);
  const G = 0.5 * (1 - Math.sqrt(Cab7 / (Cab7 + Math.pow(25, 7))));

  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);

  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  let h1p = Math.atan2(b1, a1p) * deg;
  if (h1p < 0) h1p += 360;
  let h2p = Math.atan2(b2, a2p) * deg;
  if (h2p < 0) h2p += 360;

  // Step 2: Calculate ΔL', ΔC', ΔH'
  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2p - h1p) <= 180) {
    dhp = h2p - h1p;
  } else if (h2p - h1p > 180) {
    dhp = h2p - h1p - 360;
  } else {
    dhp = h2p - h1p + 360;
  }

  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);

  // Step 3: Calculate CIEDE2000
  const Lp = (L1 + L2) / 2;
  const Cp = (C1p + C2p) / 2;

  let hp: number;
  if (C1p * C2p === 0) {
    hp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    hp = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    hp = (h1p + h2p + 360) / 2;
  } else {
    hp = (h1p + h2p - 360) / 2;
  }

  const T = 1
    - 0.17 * Math.cos((hp - 30) * rad)
    + 0.24 * Math.cos((2 * hp) * rad)
    + 0.32 * Math.cos((3 * hp + 6) * rad)
    - 0.20 * Math.cos((4 * hp - 63) * rad);

  const Lp50sq = (Lp - 50) * (Lp - 50);
  const SL = 1 + 0.015 * Lp50sq / Math.sqrt(20 + Lp50sq);
  const SC = 1 + 0.045 * Cp;
  const SH = 1 + 0.015 * Cp * T;

  const Cp7 = Math.pow(Cp, 7);
  const RT = -2 * Math.sqrt(Cp7 / (Cp7 + Math.pow(25, 7)))
    * Math.sin(60 * rad * Math.exp(-Math.pow((hp - 275) / 25, 2)));

  const dE = Math.sqrt(
    Math.pow(dLp / (kL * SL), 2) +
    Math.pow(dCp / (kC * SC), 2) +
    Math.pow(dHp / (kH * SH), 2) +
    RT * (dCp / (kC * SC)) * (dHp / (kH * SH))
  );

  return dE;
}

/**
 * Spatial White Balance Normalization
 * Detects neutral reference patches (near-white or 18% gray) in the image
 * and calculates per-channel gain multipliers to correct for lighting
 */
export interface WhiteBalanceResult {
  gainR: number;
  gainG: number;
  gainB: number;
  referenceFound: boolean;
  referenceType: 'white' | 'gray18' | 'auto';
  correctionStrength: number; // 0-1, how much correction was applied
}

export function detectWhiteBalance(imageData: ImageData): WhiteBalanceResult {
  const { data, width, height } = imageData;
  
  // Collect potential neutral reference pixels
  const neutralPixels: { r: number; g: number; b: number }[] = [];
  const grayPixels: { r: number; g: number; b: number }[] = [];
  
  // Sample every 4th pixel for speed
  for (let i = 0; i < width * height; i += 4) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3];
    if (a < 128) continue;
    
    const maxC = Math.max(r, g, b);
    const minC = Math.min(r, g, b);
    const chroma = maxC - minC;
    const lum = (r + g + b) / 3;
    
    // Near-white reference (high luminance, low chroma)
    if (lum > 200 && chroma < 20) {
      neutralPixels.push({ r, g, b });
    }
    
    // 18% gray reference (luminance ~46, which is 0.18 * 255)
    if (lum > 35 && lum < 60 && chroma < 15) {
      grayPixels.push({ r, g, b });
    }
  }
  
  // Prefer white reference, fallback to gray, then auto
  let refPixels: { r: number; g: number; b: number }[];
  let refType: WhiteBalanceResult['referenceType'];
  let targetLum: number;
  
  if (neutralPixels.length > 20) {
    refPixels = neutralPixels;
    refType = 'white';
    targetLum = 240;
  } else if (grayPixels.length > 20) {
    refPixels = grayPixels;
    refType = 'gray18';
    targetLum = 46;
  } else {
    // Auto: use brightest 5% of pixels as reference
    refType = 'auto';
    const allPixels: { r: number; g: number; b: number; lum: number }[] = [];
    for (let i = 0; i < width * height; i += 8) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      const a = data[i * 4 + 3];
      if (a < 128) continue;
      allPixels.push({ r, g, b, lum: (r + g + b) / 3 });
    }
    allPixels.sort((a, b) => b.lum - a.lum);
    refPixels = allPixels.slice(0, Math.max(10, Math.floor(allPixels.length * 0.05)));
    targetLum = 220;
  }
  
  if (refPixels.length === 0) {
    return { gainR: 1, gainG: 1, gainB: 1, referenceFound: false, referenceType: 'auto', correctionStrength: 0 };
  }
  
  // Calculate mean reference color
  let sumR = 0, sumG = 0, sumB = 0;
  for (const p of refPixels) {
    sumR += p.r; sumG += p.g; sumB += p.b;
  }
  const meanR = sumR / refPixels.length;
  const meanG = sumG / refPixels.length;
  const meanB = sumB / refPixels.length;
  
  // Calculate gain multipliers to normalize to target
  const maxMean = Math.max(meanR, meanG, meanB, 1);
  const gainR = Math.min(2, Math.max(0.5, targetLum / Math.max(meanR, 1)));
  const gainG = Math.min(2, Math.max(0.5, targetLum / Math.max(meanG, 1)));
  const gainB = Math.min(2, Math.max(0.5, targetLum / Math.max(meanB, 1)));
  
  // Normalize gains so the strongest channel = 1 (only correct ratios, not exposure)
  const maxGain = Math.max(gainR, gainG, gainB);
  const correctionStrength = refType === 'white' ? 0.9 : refType === 'gray18' ? 0.8 : 0.5;
  
  return {
    gainR: 1 + (gainR / maxGain - 1) * correctionStrength,
    gainG: 1 + (gainG / maxGain - 1) * correctionStrength,
    gainB: 1 + (gainB / maxGain - 1) * correctionStrength,
    referenceFound: refType !== 'auto',
    referenceType: refType,
    correctionStrength,
  };
}

/**
 * Apply white balance correction to RGB values
 */
export function applyWhiteBalance(r: number, g: number, b: number, wb: WhiteBalanceResult): [number, number, number] {
  return [
    Math.min(255, Math.max(0, r * wb.gainR)),
    Math.min(255, Math.max(0, g * wb.gainG)),
    Math.min(255, Math.max(0, b * wb.gainB)),
  ];
}

/**
 * Shadow Classification Engine
 * Distinguishes between real defects and shadows/artifacts
 * 
 * Shadow characteristics:
 * - Preserves RGB channel ratios (uniform darkening)
 * - Hue remains close to surrounding area
 * - Value drops but saturation stays similar
 * - Spatial gradient is smooth (shadows have gradual transitions)
 * 
 * Real defect characteristics:
 * - RGB ratios shift (burnt = more red, disease = more green/purple)
 * - Hue shifts significantly from neighbors
 * - Both V and S change
 * - Sharp spatial boundaries
 */
export interface ShadowClassification {
  isShadow: boolean;
  confidence: number; // 0-1
  reason: string;
}

export function classifyShadow(
  cellH: number, cellS: number, cellV: number,
  cellR: number, cellG: number, cellB: number,
  meanH: number, meanS: number, meanV: number,
  meanR: number, meanG: number, meanB: number,
  neighborVariance: number // HSV value variance of surrounding cells
): ShadowClassification {
  // Criterion 1: RGB ratio preservation
  // Shadows darken uniformly, so R/G, R/B, G/B ratios remain similar
  const meanRatio_RG = meanG > 0 ? meanR / meanG : 1;
  const meanRatio_RB = meanB > 0 ? meanR / meanB : 1;
  const cellRatio_RG = cellG > 0 ? cellR / cellG : 1;
  const cellRatio_RB = cellB > 0 ? cellR / cellB : 1;
  
  const ratioDeviation = Math.abs(meanRatio_RG - cellRatio_RG) + Math.abs(meanRatio_RB - cellRatio_RB);
  const ratioPreserved = ratioDeviation < 0.3; // Shadows preserve ratios
  
  // Criterion 2: Hue preservation
  let hueDiff = Math.abs(cellH - meanH);
  if (hueDiff > 180) hueDiff = 360 - hueDiff;
  const huePreserved = hueDiff < 15; // Shadows don't shift hue much
  
  // Criterion 3: Saturation similarity
  const satDiff = Math.abs(cellS - meanS);
  const satPreserved = satDiff < 0.15; // Shadows preserve saturation
  
  // Criterion 4: Value drop pattern
  const vDrop = meanV - cellV;
  const isDarker = vDrop > 0.1;
  const isModeratelyDark = vDrop > 0.1 && vDrop < 0.5; // Very extreme = likely real defect
  
  // Criterion 5: Spatial smoothness (gradual = shadow, sharp = defect)
  const isSpatiallySmooth = neighborVariance < 0.04;
  
  // Scoring
  let shadowScore = 0;
  if (ratioPreserved) shadowScore += 0.3;
  if (huePreserved) shadowScore += 0.25;
  if (satPreserved) shadowScore += 0.2;
  if (isModeratelyDark) shadowScore += 0.15;
  if (isSpatiallySmooth) shadowScore += 0.1;
  
  // Strong anti-shadow signals
  if (!isDarker) shadowScore = 0; // Not darker = can't be shadow
  if (hueDiff > 25) shadowScore *= 0.3; // Large hue shift = not shadow
  if (cellV < 0.12) shadowScore *= 0.4; // Very very dark = could be real burn
  if (!ratioPreserved && hueDiff > 15) shadowScore *= 0.2; // Both ratios and hue shift
  
  const isShadow = shadowScore > 0.5;
  
  let reason = '';
  if (isShadow) {
    reason = ratioPreserved && huePreserved ? 'Uniform darkening with preserved color ratios'
      : ratioPreserved ? 'RGB ratios preserved despite value drop'
      : 'Hue and saturation preserved under darkening';
  } else {
    reason = hueDiff > 20 ? 'Significant hue shift indicates real defect'
      : !ratioPreserved ? 'RGB ratio change indicates chemical/surface change'
      : 'Pattern consistent with real surface defect';
  }
  
  return { isShadow, confidence: Math.min(1, shadowScore), reason };
}

/**
 * Compute neighbor value variance for shadow detection
 */
export function computeNeighborVariance(
  grid: { v: number }[][],
  validGrid: boolean[][],
  gy: number, gx: number,
  gridH: number, gridW: number
): number {
  const values: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ny = gy + dy, nx = gx + dx;
      if (ny >= 0 && ny < gridH && nx >= 0 && nx < gridW && validGrid[ny][nx]) {
        values.push(grid[ny][nx].v);
      }
    }
  }
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((a, v) => a + (v - mean) * (v - mean), 0) / values.length;
}

/**
 * Maillard Reaction Intensity → Acrylamide Risk Estimation
 * Based on ΔE deviation from USDA 0.5 target golden color
 * 
 * Scientific basis: Acrylamide formation correlates with browning intensity
 * (Maillard reaction products). Darker = more acrylamide.
 */
export interface AcrylamideRisk {
  level: 'low' | 'moderate' | 'elevated' | 'high' | 'critical';
  estimatedPpb: number; // estimated parts per billion
  maillardIntensity: number; // 0-1
  deltaEFromTarget: number;
  complianceStatus: string;
}

export function estimateAcrylamideRisk(
  meanL: number, meanA: number, meanB_lab: number,
  burnedRatio: number
): AcrylamideRisk {
  // USDA 0.5 target in Lab: approximately L*=70, a*=8, b*=40 (bright golden)
  const targetL = 70, targetA = 8, targetB = 40;
  
  const deltaE = cieDe2000(meanL, meanA, meanB_lab, targetL, targetA, targetB);
  
  // Maillard intensity: higher deltaE from golden = more browning
  // Normalize to 0-1 where 0 = perfect golden, 1 = severely burnt
  const maillardIntensity = Math.min(1, deltaE / 50);
  
  // Acrylamide estimation based on published correlations
  // (simplified model: ppb ≈ base + browning_factor * intensity²)
  // EU benchmark: 500 ppb for french fries
  const basePpb = 50;
  const browningFactor = 800;
  const burnPenalty = burnedRatio * 1500;
  const estimatedPpb = basePpb + browningFactor * maillardIntensity * maillardIntensity + burnPenalty;
  
  let level: AcrylamideRisk['level'];
  let complianceStatus: string;
  
  if (estimatedPpb < 200) {
    level = 'low';
    complianceStatus = 'Well within EU/FDA guidelines (< 500 ppb)';
  } else if (estimatedPpb < 350) {
    level = 'moderate';
    complianceStatus = 'Within compliance range';
  } else if (estimatedPpb < 500) {
    level = 'elevated';
    complianceStatus = 'Approaching EU benchmark limit (500 ppb)';
  } else if (estimatedPpb < 750) {
    level = 'high';
    complianceStatus = 'EXCEEDS EU benchmark — corrective action required';
  } else {
    level = 'critical';
    complianceStatus = 'CRITICAL — Significantly exceeds safety benchmarks';
  }
  
  return {
    level,
    estimatedPpb: Math.round(estimatedPpb),
    maillardIntensity,
    deltaEFromTarget: deltaE,
    complianceStatus,
  };
}

/**
 * Contour-Weighted Scoring Model
 * Replaces the 1/3 rule with position-aware defect weighting
 * 
 * - Tip defects (sugar ends) weighted 1.5x (common, less critical)
 * - Center defects (bruising) weighted 2.0x (more concerning)
 * - Edge defects weighted 0.8x (may be artifact)
 */
export function getContourWeight(
  defectX: number, defectY: number,
  defectW: number, defectH: number,
  imageWidth: number, imageHeight: number
): { weight: number; position: string } {
  const centerX = defectX + defectW / 2;
  const centerY = defectY + defectH / 2;
  
  // Normalize position to 0-1
  const normX = centerX / imageWidth;
  const normY = centerY / imageHeight;
  
  // Distance from center of image
  const distFromCenter = Math.sqrt(
    Math.pow(normX - 0.5, 2) + Math.pow(normY - 0.5, 2)
  );
  
  // Tip detection: near left/right edges (for horizontal fries)
  const isTip = normX < 0.1 || normX > 0.9;
  const isEdge = normY < 0.05 || normY > 0.95;
  const isCenter = distFromCenter < 0.25;
  
  if (isEdge) {
    return { weight: 0.6, position: 'edge' };
  }
  if (isTip) {
    return { weight: 1.2, position: 'tip' };
  }
  if (isCenter) {
    return { weight: 1.8, position: 'center' };
  }
  
  // Gradient: more weight towards center
  const weight = 0.8 + (1 - distFromCenter) * 1.0;
  return { weight: Math.min(2.0, weight), position: 'mid' };
}
