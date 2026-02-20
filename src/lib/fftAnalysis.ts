// Fast Fourier Transform (FFT) based Texture & Crispness Analysis
// Analyzes surface luminance frequency patterns to estimate crust quality

/**
 * 1D FFT (Cooley-Tukey radix-2)
 * Input: real-valued array (length must be power of 2)
 * Output: magnitude spectrum
 */
function fft1d(input: number[]): number[] {
  const n = input.length;
  if (n === 1) return [Math.abs(input[0])];
  
  // Pad to power of 2 if needed
  const size = Math.pow(2, Math.ceil(Math.log2(n)));
  const real = new Float64Array(size);
  const imag = new Float64Array(size);
  for (let i = 0; i < n; i++) real[i] = input[i];
  
  // Bit-reversal permutation
  const bits = Math.log2(size);
  for (let i = 0; i < size; i++) {
    let rev = 0;
    for (let j = 0; j < bits; j++) {
      rev = (rev << 1) | ((i >> j) & 1);
    }
    if (rev > i) {
      [real[i], real[rev]] = [real[rev], real[i]];
      [imag[i], imag[rev]] = [imag[rev], imag[i]];
    }
  }
  
  // FFT butterfly
  for (let len = 2; len <= size; len *= 2) {
    const halfLen = len / 2;
    const angle = -2 * Math.PI / len;
    for (let i = 0; i < size; i += len) {
      for (let j = 0; j < halfLen; j++) {
        const cos = Math.cos(angle * j);
        const sin = Math.sin(angle * j);
        const tReal = real[i + j + halfLen] * cos - imag[i + j + halfLen] * sin;
        const tImag = real[i + j + halfLen] * sin + imag[i + j + halfLen] * cos;
        real[i + j + halfLen] = real[i + j] - tReal;
        imag[i + j + halfLen] = imag[i + j] - tImag;
        real[i + j] += tReal;
        imag[i + j] += tImag;
      }
    }
  }
  
  // Magnitude spectrum (only first half - Nyquist)
  const magnitudes = new Array(size / 2);
  for (let i = 0; i < size / 2; i++) {
    magnitudes[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / size;
  }
  
  return magnitudes;
}

/**
 * Spectral Density Analysis Result
 */
export interface TextureAnalysis {
  crispnessScore: number;         // 0-100, higher = crispier
  crustMicroTopography: number;   // 0-1, surface roughness measure
  spectralEnergy: {
    lowFreq: number;              // 0-1, soggy/smooth indicator
    midFreq: number;              // 0-1, normal texture
    highFreq: number;             // 0-1, crispy/rough indicator
  };
  dominantFrequency: number;      // Hz equivalent (normalized)
  textureClass: 'crispy' | 'normal' | 'soft' | 'soggy';
  spectralProfile: number[];      // Normalized magnitude spectrum for visualization
}

/**
 * Analyze texture of a fry surface using FFT on luminance patches
 * Samples multiple horizontal scanlines across the image
 */
export function analyzeTexture(imageData: ImageData): TextureAnalysis {
  const { data, width, height } = imageData;
  
  // Sample horizontal scanlines across the fry region
  const numScanlines = Math.min(32, Math.floor(height / 4));
  const allSpectra: number[][] = [];
  
  for (let sy = 0; sy < numScanlines; sy++) {
    const y = Math.floor((sy + 0.5) * height / numScanlines);
    
    // Extract luminance along this scanline
    const scanline: number[] = [];
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
      if (a < 128) continue;
      // Luminance
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      scanline.push(lum);
    }
    
    if (scanline.length < 16) continue;
    
    // Truncate to nearest power of 2
    const pow2 = Math.pow(2, Math.floor(Math.log2(scanline.length)));
    const truncated = scanline.slice(0, pow2);
    
    // Apply Hann window to reduce spectral leakage
    for (let i = 0; i < truncated.length; i++) {
      truncated[i] *= 0.5 * (1 - Math.cos(2 * Math.PI * i / (truncated.length - 1)));
    }
    
    const spectrum = fft1d(truncated);
    allSpectra.push(spectrum);
  }
  
  if (allSpectra.length === 0) {
    return {
      crispnessScore: 50,
      crustMicroTopography: 0.5,
      spectralEnergy: { lowFreq: 0.33, midFreq: 0.33, highFreq: 0.33 },
      dominantFrequency: 0,
      textureClass: 'normal',
      spectralProfile: [],
    };
  }
  
  // Average spectra across all scanlines
  const specLen = Math.min(...allSpectra.map(s => s.length));
  const avgSpectrum = new Array(specLen).fill(0);
  for (const spec of allSpectra) {
    for (let i = 0; i < specLen; i++) {
      avgSpectrum[i] += spec[i] / allSpectra.length;
    }
  }
  
  // Divide spectrum into 3 bands
  const third = Math.floor(specLen / 3);
  let lowEnergy = 0, midEnergy = 0, highEnergy = 0, totalEnergy = 0;
  
  // Skip DC component (index 0)
  for (let i = 1; i < specLen; i++) {
    const e = avgSpectrum[i] * avgSpectrum[i]; // Power spectrum
    totalEnergy += e;
    if (i < third) lowEnergy += e;
    else if (i < 2 * third) midEnergy += e;
    else highEnergy += e;
  }
  
  totalEnergy = Math.max(totalEnergy, 1e-10);
  const lowFreq = lowEnergy / totalEnergy;
  const midFreq = midEnergy / totalEnergy;
  const highFreq = highEnergy / totalEnergy;
  
  // Find dominant frequency
  let maxMag = 0, domIdx = 1;
  for (let i = 1; i < specLen; i++) {
    if (avgSpectrum[i] > maxMag) {
      maxMag = avgSpectrum[i];
      domIdx = i;
    }
  }
  const dominantFrequency = domIdx / specLen;
  
  // Crispness score: high-frequency energy → crispier
  // Formula: weighted combination favoring high frequencies
  const crispnessRaw = highFreq * 60 + midFreq * 30 + (1 - lowFreq) * 10;
  const crispnessScore = Math.min(100, Math.max(0, Math.round(crispnessRaw * 100 / 100)));
  
  // Crust micro-topography: RMS of high-frequency components
  let hfRms = 0;
  for (let i = 2 * third; i < specLen; i++) {
    hfRms += avgSpectrum[i] * avgSpectrum[i];
  }
  hfRms = Math.sqrt(hfRms / Math.max(1, specLen - 2 * third));
  const crustMicroTopography = Math.min(1, hfRms / (maxMag + 1e-10));
  
  // Classify texture
  let textureClass: TextureAnalysis['textureClass'];
  if (highFreq > 0.4) textureClass = 'crispy';
  else if (highFreq > 0.25) textureClass = 'normal';
  else if (lowFreq > 0.6) textureClass = 'soggy';
  else textureClass = 'soft';
  
  // Normalize spectrum for visualization (0-1)
  const maxSpec = Math.max(...avgSpectrum.slice(1));
  const spectralProfile = avgSpectrum.slice(1).map(v => v / (maxSpec + 1e-10));
  
  return {
    crispnessScore,
    crustMicroTopography,
    spectralEnergy: { lowFreq, midFreq, highFreq },
    dominantFrequency,
    textureClass,
    spectralProfile,
  };
}
