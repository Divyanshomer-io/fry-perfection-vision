// Fuzzy Logic PQI Controller
// Non-linear quality assessment with attribute interaction penalties

/**
 * Fuzzy membership functions for McDonald's 1-9 scale
 */
type FuzzySet = 'excellent' | 'good' | 'acceptable' | 'poor' | 'reject';

interface FuzzyMembership {
  excellent: number;
  good: number;
  acceptable: number;
  poor: number;
  reject: number;
}

function fuzzify(score: number): FuzzyMembership {
  return {
    excellent: score === 5 ? 1.0 : score === 4 || score === 6 ? 0.3 : 0,
    good: score === 4 || score === 6 ? 0.8 : score === 5 ? 0.5 : score === 3 || score === 7 ? 0.2 : 0,
    acceptable: score === 3 || score === 7 ? 0.8 : score === 4 || score === 6 ? 0.3 : 0,
    poor: score === 2 || score === 8 ? 1.0 : score === 3 || score === 7 ? 0.3 : 0,
    reject: score === 1 || score === 9 ? 1.0 : score === 2 || score === 8 ? 0.3 : 0,
  };
}

/**
 * Interaction penalty matrix
 * When multiple attributes are poor simultaneously, the penalty compounds exponentially
 */
function interactionPenalty(
  processColor: FuzzyMembership,
  hue: FuzzyMembership,
  mottling: FuzzyMembership,
  defects: FuzzyMembership
): number {
  // Rule 1: If hue is "good" (creamy yellow, score 6) BUT mottling is high → exponential penalty
  // "Creamy yellow with mottling" is worse than either alone
  const hueMottlingInteraction = hue.good * mottling.poor * 1.5;
  const hueMottlingReject = hue.acceptable * mottling.reject * 2.0;
  
  // Rule 2: If process color is dark AND defects are high → compounding
  // Dark color with defects = double trouble
  const colorDefectInteraction = processColor.poor * defects.poor * 1.8;
  const colorDefectReject = processColor.reject * defects.reject * 3.0;
  
  // Rule 3: If all four attributes are merely "acceptable" → still penalize
  // "Mediocre across the board" should score lower than "great in 3, acceptable in 1"
  const uniformMediocrity = processColor.acceptable * hue.acceptable * mottling.acceptable * defects.acceptable * 2.0;
  
  // Rule 4: Color + Hue disagreement penalty
  // If process color says "dark" but hue says "light" → something is wrong with measurement
  const colorHueConflict = (processColor.poor * hue.good + processColor.good * hue.poor) * 0.5;
  
  // Rule 5: Triple penalty - three or more attributes poor
  const tripleCount = [processColor, hue, mottling, defects]
    .filter(m => m.poor > 0.5 || m.reject > 0.5).length;
  const triplePenalty = tripleCount >= 3 ? tripleCount * 5 : 0;
  
  return Math.min(60, 
    hueMottlingInteraction + hueMottlingReject + 
    colorDefectInteraction + colorDefectReject + 
    uniformMediocrity + colorHueConflict + triplePenalty
  );
}

/**
 * Base PQI from fuzzy centroid
 */
function fuzzyBasePQI(membership: FuzzyMembership): number {
  // Centroid values for each fuzzy set
  const centroids = { excellent: 100, good: 85, acceptable: 65, poor: 30, reject: 0 };
  
  const totalWeight = membership.excellent + membership.good + membership.acceptable + 
                      membership.poor + membership.reject + 1e-10;
  
  const centroid = (
    membership.excellent * centroids.excellent +
    membership.good * centroids.good +
    membership.acceptable * centroids.acceptable +
    membership.poor * centroids.poor +
    membership.reject * centroids.reject
  ) / totalWeight;
  
  return centroid;
}

export interface FuzzyPQIResult {
  pqi: number;                       // 0-100
  basePQI: number;                   // Before interaction penalties
  interactionPenalty: number;         // Penalty from attribute interactions
  attributeContributions: {
    processColor: number;            // Individual contribution to PQI
    hue: number;
    mottling: number;
    defects: number;
  };
  fuzzyMemberships: {
    processColor: FuzzyMembership;
    hue: FuzzyMembership;
    mottling: FuzzyMembership;
    defects: FuzzyMembership;
  };
  dominantSet: FuzzySet;
  reasoning: string[];               // Explainable reasoning chain
}

/**
 * Calculate Fuzzy Logic PQI
 * Replaces simple base+bonus formula with non-linear interactive model
 */
export function calculateFuzzyPQI(
  processColorScore: number,
  hueScore: number,
  mottlingScore: number,
  defectScore: number
): FuzzyPQIResult {
  // Step 1: Fuzzify all inputs
  const pcMem = fuzzify(processColorScore);
  const hueMem = fuzzify(hueScore);
  const motMem = fuzzify(mottlingScore);
  const defMem = fuzzify(defectScore);
  
  // Step 2: Calculate individual base PQIs
  const pcBase = fuzzyBasePQI(pcMem);
  const hueBase = fuzzyBasePQI(hueMem);
  const motBase = fuzzyBasePQI(motMem);
  const defBase = fuzzyBasePQI(defMem);
  
  // Step 3: Weighted average (process color and defects weigh more)
  const weights = { pc: 0.3, hue: 0.2, mot: 0.2, def: 0.3 };
  const weightedBase = pcBase * weights.pc + hueBase * weights.hue + 
                       motBase * weights.mot + defBase * weights.def;
  
  // Step 4: Calculate interaction penalties
  const penalty = interactionPenalty(pcMem, hueMem, motMem, defMem);
  
  // Step 5: Hard rejection/failure rules (preserved from McDonald's spec)
  const scores = [processColorScore, hueScore, mottlingScore, defectScore];
  const hasRejection = scores.some(s => s === 1 || s === 9);
  const hasFailure = scores.some(s => s === 2 || s === 8);
  
  let finalPQI: number;
  if (hasRejection) {
    finalPQI = 0;
  } else if (hasFailure) {
    finalPQI = Math.min(25, weightedBase - penalty);
  } else {
    finalPQI = Math.max(0, Math.min(100, Math.round(weightedBase - penalty)));
  }
  
  // Determine dominant fuzzy set
  const combined: FuzzyMembership = {
    excellent: (pcMem.excellent + hueMem.excellent + motMem.excellent + defMem.excellent) / 4,
    good: (pcMem.good + hueMem.good + motMem.good + defMem.good) / 4,
    acceptable: (pcMem.acceptable + hueMem.acceptable + motMem.acceptable + defMem.acceptable) / 4,
    poor: (pcMem.poor + hueMem.poor + motMem.poor + defMem.poor) / 4,
    reject: (pcMem.reject + hueMem.reject + motMem.reject + defMem.reject) / 4,
  };
  
  const dominantSet = (Object.entries(combined) as [FuzzySet, number][])
    .reduce((a, b) => a[1] >= b[1] ? a : b)[0];
  
  // Generate reasoning chain
  const reasoning: string[] = [];
  if (hasRejection) reasoning.push('REJECTION: Score 1 or 9 detected → PQI = 0%');
  if (hasFailure) reasoning.push('FAILURE: Score 2 or 8 detected → PQI capped at 25%');
  if (penalty > 5) reasoning.push(`Interaction penalty: -${penalty.toFixed(0)}% (attribute interactions detected)`);
  if (pcMem.poor > 0.5 && defMem.poor > 0.5) reasoning.push('⚠ Process color + defects both poor → compound penalty');
  if (hueMem.good > 0.3 && motMem.poor > 0.5) reasoning.push('⚠ Acceptable hue with high mottling → exponential penalty');
  if (scores.every(s => s === 5)) reasoning.push('✓ All attributes at target → Perfect score');
  if (penalty < 2 && !hasFailure && !hasRejection) reasoning.push('✓ Low interaction penalties → attributes are harmonious');
  
  return {
    pqi: finalPQI,
    basePQI: Math.round(weightedBase),
    interactionPenalty: Math.round(penalty),
    attributeContributions: {
      processColor: Math.round(pcBase),
      hue: Math.round(hueBase),
      mottling: Math.round(motBase),
      defects: Math.round(defBase),
    },
    fuzzyMemberships: {
      processColor: pcMem,
      hue: hueMem,
      mottling: motMem,
      defects: defMem,
    },
    dominantSet,
    reasoning,
  };
}

/**
 * Generate Grad-CAM style contribution map
 * Shows per-cell contribution to PQI reduction
 * Used for explainable AI visualization
 */
export function generateGradCAMData(
  heatmapData: number[][],
  defects: { x: number; y: number; severity: number; type: string }[],
  gridSize: number = 20
): number[][] {
  const rows = heatmapData.length;
  const cols = heatmapData[0]?.length || 0;
  const gradcam: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));
  
  // Layer 1: Burn intensity contribution
  const maxHeat = Math.max(...heatmapData.flat(), 0.01);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      gradcam[y][x] += (heatmapData[y][x] / maxHeat) * 0.4;
    }
  }
  
  // Layer 2: Defect region contribution
  for (const defect of defects) {
    const gx = Math.floor(defect.x / gridSize);
    const gy = Math.floor(defect.y / gridSize);
    if (gy >= 0 && gy < rows && gx >= 0 && gx < cols) {
      const weight = defect.type === 'burnt' ? 0.6 : defect.type === 'dark' ? 0.4 : 0.3;
      gradcam[gy][gx] += defect.severity * weight;
      // Gaussian spread to neighbors
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const ny = gy + dy, nx = gx + dx;
          if (ny >= 0 && ny < rows && nx >= 0 && nx < cols && (dy !== 0 || dx !== 0)) {
            gradcam[ny][nx] += defect.severity * weight * 0.3;
          }
        }
      }
    }
  }
  
  // Normalize to 0-1
  const maxGrad = Math.max(...gradcam.flat(), 0.01);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      gradcam[y][x] = Math.min(1, gradcam[y][x] / maxGrad);
    }
  }
  
  return gradcam;
}
