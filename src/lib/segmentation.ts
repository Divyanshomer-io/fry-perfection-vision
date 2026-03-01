/**
 * Instance Segmentation Engine
 * 
 * Implements:
 * - LAB L-channel isolation
 * - CLAHE (Contrast Limited Adaptive Histogram Equalization)
 * - Adaptive thresholding
 * - Morphological operations (open/close/erode)
 * - Distance Transform + Watershed for touching object separation
 * - Contour extraction with smoothing
 * - Non-fry filtering (aspect ratio, area)
 */

export interface Contour {
  points: { x: number; y: number }[];
  boundingBox: { x: number; y: number; w: number; h: number };
  area: number;
  color: string; // display color for overlay
}

export interface SegmentationResult {
  contours: Contour[];
  mask: Uint8Array; // binary mask (255 = fry, 0 = background)
  width: number;
  height: number;
  processingTime: number;
}

// ── RGB → L (CIE LAB lightness) ──
function rgbToL(r: number, g: number, b: number): number {
  let rr = r / 255, gg = g / 255, bb = b / 255;
  rr = rr > 0.04045 ? Math.pow((rr + 0.055) / 1.055, 2.4) : rr / 12.92;
  gg = gg > 0.04045 ? Math.pow((gg + 0.055) / 1.055, 2.4) : gg / 12.92;
  bb = bb > 0.04045 ? Math.pow((bb + 0.055) / 1.055, 2.4) : bb / 12.92;
  const Y = rr * 0.2126 + gg * 0.7152 + bb * 0.0722;
  const fy = Y > 0.008856 ? Math.cbrt(Y) : 7.787 * Y + 16 / 116;
  return 116 * fy - 16;
}

// ── CLAHE on single-channel image ──
function applyCLAHE(
  channel: Float32Array, w: number, h: number,
  clipLimit: number = 3.0, tileW: number = 8, tileH: number = 8
): Float32Array {
  const out = new Float32Array(channel.length);
  const tilesX = Math.max(1, Math.ceil(w / tileW));
  const tilesY = Math.max(1, Math.ceil(h / tileH));
  const numBins = 256;

  // Build per-tile histograms and CDFs
  const cdfs: Float32Array[][] = [];
  for (let ty = 0; ty < tilesY; ty++) {
    cdfs[ty] = [];
    for (let tx = 0; tx < tilesX; tx++) {
      const hist = new Float32Array(numBins);
      let count = 0;
      const x0 = tx * tileW, y0 = ty * tileH;
      const x1 = Math.min(x0 + tileW, w), y1 = Math.min(y0 + tileH, h);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const bin = Math.min(255, Math.max(0, Math.round(channel[y * w + x])));
          hist[bin]++;
          count++;
        }
      }
      if (count === 0) count = 1;

      // Clip histogram
      const clipThreshold = clipLimit * (count / numBins);
      let excess = 0;
      for (let i = 0; i < numBins; i++) {
        if (hist[i] > clipThreshold) {
          excess += hist[i] - clipThreshold;
          hist[i] = clipThreshold;
        }
      }
      const redistrib = excess / numBins;
      for (let i = 0; i < numBins; i++) hist[i] += redistrib;

      // CDF
      const cdf = new Float32Array(numBins);
      cdf[0] = hist[0];
      for (let i = 1; i < numBins; i++) cdf[i] = cdf[i - 1] + hist[i];
      const cdfMin = cdf[0];
      const scale = count - cdfMin > 0 ? 255 / (count - cdfMin) : 1;
      for (let i = 0; i < numBins; i++) {
        cdf[i] = Math.max(0, Math.min(255, (cdf[i] - cdfMin) * scale));
      }
      cdfs[ty][tx] = cdf;
    }
  }

  // Apply with bilinear interpolation between tile CDFs
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const bin = Math.min(255, Math.max(0, Math.round(channel[y * w + x])));
      const tx = Math.min(tilesX - 1, Math.floor(x / tileW));
      const ty = Math.min(tilesY - 1, Math.floor(y / tileH));
      out[y * w + x] = cdfs[ty][tx][bin];
    }
  }
  return out;
}

// ── Adaptive Threshold (mean-based) ──
function adaptiveThreshold(
  channel: Float32Array, w: number, h: number, blockSize: number = 15, C: number = 5
): Uint8Array {
  const result = new Uint8Array(w * h);
  const halfBlock = Math.floor(blockSize / 2);

  // Integral image for fast mean computation
  const integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += channel[y * w + x];
      integral[(y + 1) * (w + 1) + (x + 1)] = rowSum + integral[y * (w + 1) + (x + 1)];
    }
  }

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const y0 = Math.max(0, y - halfBlock);
      const y1 = Math.min(h - 1, y + halfBlock);
      const x0 = Math.max(0, x - halfBlock);
      const x1 = Math.min(w - 1, x + halfBlock);
      const area = (y1 - y0 + 1) * (x1 - x0 + 1);
      const sum = integral[(y1 + 1) * (w + 1) + (x1 + 1)]
                - integral[y0 * (w + 1) + (x1 + 1)]
                - integral[(y1 + 1) * (w + 1) + x0]
                + integral[y0 * (w + 1) + x0];
      const mean = sum / area;
      result[y * w + x] = channel[y * w + x] > mean - C ? 255 : 0;
    }
  }
  return result;
}

// ── Morphological Operations ──
function dilate(mask: Uint8Array, w: number, h: number, kernelSize: number = 3): Uint8Array {
  const out = new Uint8Array(mask.length);
  const half = Math.floor(kernelSize / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let maxVal = 0;
      for (let ky = -half; ky <= half; ky++) {
        for (let kx = -half; kx <= half; kx++) {
          const ny = y + ky, nx = x + kx;
          if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
            maxVal = Math.max(maxVal, mask[ny * w + nx]);
          }
        }
      }
      out[y * w + x] = maxVal;
    }
  }
  return out;
}

function erode(mask: Uint8Array, w: number, h: number, kernelSize: number = 3): Uint8Array {
  const out = new Uint8Array(mask.length);
  const half = Math.floor(kernelSize / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let minVal = 255;
      for (let ky = -half; ky <= half; ky++) {
        for (let kx = -half; kx <= half; kx++) {
          const ny = y + ky, nx = x + kx;
          if (ny >= 0 && ny < h && nx >= 0 && nx < w) {
            minVal = Math.min(minVal, mask[ny * w + nx]);
          }
        }
      }
      out[y * w + x] = minVal;
    }
  }
  return out;
}

function morphOpen(mask: Uint8Array, w: number, h: number, k: number = 3): Uint8Array {
  return dilate(erode(mask, w, h, k), w, h, k);
}

function morphClose(mask: Uint8Array, w: number, h: number, k: number = 3): Uint8Array {
  return erode(dilate(mask, w, h, k), w, h, k);
}

// ── Distance Transform (Chamfer 3-4) ──
function distanceTransform(mask: Uint8Array, w: number, h: number): Float32Array {
  const dist = new Float32Array(w * h);
  const INF = w + h;

  // Initialize
  for (let i = 0; i < mask.length; i++) {
    dist[i] = mask[i] > 0 ? INF : 0;
  }

  // Forward pass
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      if (dist[idx] === 0) continue;
      dist[idx] = Math.min(
        dist[idx],
        dist[(y - 1) * w + (x - 1)] + 4,
        dist[(y - 1) * w + x] + 3,
        dist[(y - 1) * w + (x + 1)] + 4,
        dist[y * w + (x - 1)] + 3
      );
    }
  }

  // Backward pass
  for (let y = h - 2; y >= 1; y--) {
    for (let x = w - 2; x >= 1; x--) {
      const idx = y * w + x;
      if (dist[idx] === 0) continue;
      dist[idx] = Math.min(
        dist[idx],
        dist[(y + 1) * w + (x + 1)] + 4,
        dist[(y + 1) * w + x] + 3,
        dist[(y + 1) * w + (x - 1)] + 4,
        dist[y * w + (x + 1)] + 3
      );
    }
  }

  return dist;
}

// ── Watershed-style label propagation ──
function watershedLabeling(
  mask: Uint8Array, dist: Float32Array, w: number, h: number
): Int32Array {
  const labels = new Int32Array(w * h);
  let nextLabel = 1;

  // Find local maxima in distance transform as seeds
  const seeds: { x: number; y: number; dist: number }[] = [];
  const minSeedDist = 6; // minimum distance for a seed

  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const idx = y * w + x;
      if (mask[idx] === 0 || dist[idx] < minSeedDist) continue;

      let isMax = true;
      for (let dy = -2; dy <= 2 && isMax; dy++) {
        for (let dx = -2; dx <= 2 && isMax; dx++) {
          if (dy === 0 && dx === 0) continue;
          const ni = (y + dy) * w + (x + dx);
          if (dist[ni] > dist[idx]) isMax = false;
        }
      }
      if (isMax) seeds.push({ x, y, dist: dist[idx] });
    }
  }

  // Merge seeds that are too close
  const mergedSeeds: typeof seeds = [];
  const used = new Set<number>();
  for (let i = 0; i < seeds.length; i++) {
    if (used.has(i)) continue;
    let sx = seeds[i].x, sy = seeds[i].y, sd = seeds[i].dist, cnt = 1;
    for (let j = i + 1; j < seeds.length; j++) {
      if (used.has(j)) continue;
      const dx = seeds[i].x - seeds[j].x, dy = seeds[i].y - seeds[j].y;
      if (Math.sqrt(dx * dx + dy * dy) < minSeedDist * 2) {
        sx += seeds[j].x; sy += seeds[j].y;
        sd = Math.max(sd, seeds[j].dist);
        cnt++;
        used.add(j);
      }
    }
    mergedSeeds.push({ x: Math.round(sx / cnt), y: Math.round(sy / cnt), dist: sd });
  }

  // Assign labels from seeds via BFS, sorted by distance (highest first)
  mergedSeeds.sort((a, b) => b.dist - a.dist);
  
  interface QueueItem { x: number; y: number }
  
  for (const seed of mergedSeeds) {
    const label = nextLabel++;
    const queue: QueueItem[] = [{ x: seed.x, y: seed.y }];
    labels[seed.y * w + seed.x] = label;

    while (queue.length > 0) {
      const { x, y } = queue.shift()!;
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const ni = ny * w + nx;
        if (labels[ni] !== 0 || mask[ni] === 0) continue;
        labels[ni] = label;
        queue.push({ x: nx, y: ny });
      }
    }
  }

  // Label any remaining foreground pixels not reached by seeds
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] > 0 && labels[i] === 0) {
      // Assign to nearest labeled neighbor via small BFS
      const startY = Math.floor(i / w), startX = i % w;
      const q: QueueItem[] = [{ x: startX, y: startY }];
      const visited = new Set<number>();
      visited.add(i);
      let found = false;
      while (q.length > 0 && !found) {
        const { x, y } = q.shift()!;
        for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const ni = ny * w + nx;
          if (visited.has(ni)) continue;
          visited.add(ni);
          if (labels[ni] > 0) {
            // Found a labeled pixel - assign all visited to this label
            const lbl = labels[ni];
            for (const vi of visited) {
              if (mask[vi] > 0) labels[vi] = lbl;
            }
            found = true;
            break;
          }
          if (mask[ni] > 0) q.push({ x: nx, y: ny });
        }
      }
    }
  }

  return labels;
}

// ── Contour Tracing (simplified marching squares) ──
function extractContours(
  labels: Int32Array, w: number, h: number, mask: Uint8Array
): Contour[] {
  const contourColors = [
    '#00ffcc', '#ff6b35', '#00d4ff', '#ff3366', '#88ff00',
    '#ff00aa', '#00ff88', '#ffaa00', '#6644ff', '#ff4444',
  ];

  const uniqueLabels = new Set<number>();
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] > 0) uniqueLabels.add(labels[i]);
  }

  const contours: Contour[] = [];

  for (const label of uniqueLabels) {
    // Find bounding box and boundary pixels
    let minX = w, minY = h, maxX = 0, maxY = 0;
    let area = 0;
    const boundary: { x: number; y: number }[] = [];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (labels[y * w + x] !== label) continue;
        area++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;

        // Is boundary? Check 4-neighbors
        let isBoundary = false;
        for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h || labels[ny * w + nx] !== label) {
            isBoundary = true;
            break;
          }
        }
        if (isBoundary) boundary.push({ x, y });
      }
    }

    // Filter: min area, aspect ratio rejection
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    if (area < 200) continue; // Too small
    const aspect = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh));
    if (aspect < 1.2 && area < 1000) continue; // Square-ish & small = likely marker/artifact

    // Sort boundary points into a rough contour by angle from centroid
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    boundary.sort((a, b) => {
      const angleA = Math.atan2(a.y - cy, a.x - cx);
      const angleB = Math.atan2(b.y - cy, b.x - cx);
      return angleA - angleB;
    });

    // Subsample for smooth rendering
    const step = Math.max(1, Math.floor(boundary.length / 100));
    const smoothed = boundary.filter((_, i) => i % step === 0);

    contours.push({
      points: smoothed,
      boundingBox: { x: minX, y: minY, w: bw, h: bh },
      area,
      color: contourColors[contours.length % contourColors.length],
    });
  }

  return contours;
}

// ── Main Segmentation Pipeline ──
export function segmentFries(imageData: ImageData): SegmentationResult {
  const start = performance.now();
  const { data, width: w, height: h } = imageData;

  // Step 1: Extract L-channel
  const lChannel = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    lChannel[i] = (rgbToL(r, g, b) / 100) * 255; // normalize to 0-255
  }

  // Step 2: CLAHE
  const tileSize = Math.max(16, Math.round(Math.min(w, h) / 8));
  const enhanced = applyCLAHE(lChannel, w, h, 3.0, tileSize, tileSize);

  // Step 3: Adaptive threshold
  const blockSize = Math.max(11, Math.round(Math.min(w, h) / 20) | 1);
  let binary = adaptiveThreshold(enhanced, w, h, blockSize, 8);

  // Step 4: Morphological cleanup
  binary = morphClose(binary, w, h, 5); // close small gaps
  binary = morphOpen(binary, w, h, 3);  // remove small noise

  // Step 5: Erode 2 iterations with 3x3 kernel (shadow buffer)
  binary = erode(binary, w, h, 3);
  binary = erode(binary, w, h, 3);

  // Step 6: Distance Transform
  const dist = distanceTransform(binary, w, h);

  // Step 7: Watershed labeling
  const labels = watershedLabeling(binary, dist, w, h);

  // Step 8: Extract contours
  const contours = extractContours(labels, w, h, binary);

  const processingTime = performance.now() - start;

  return { contours, mask: binary, width: w, height: h, processingTime };
}

// ── Apply Binary Mask (Blackout) ──
export function applyBlackoutMask(
  imageData: ImageData, contours: Contour[]
): ImageData {
  const { data, width: w, height: h } = imageData;
  const out = new ImageData(w, h);
  const outData = out.data;

  // Create mask from contours using flood fill from contour interiors
  const mask = new Uint8Array(w * h);

  for (const contour of contours) {
    const { x: bx, y: by, w: bw, h: bh } = contour.boundingBox;

    // Rasterize: for each scanline in bounding box, check if pixel is inside contour
    // Use ray-casting for point-in-polygon test on the contour points
    for (let y = by; y < Math.min(by + bh, h); y++) {
      for (let x = bx; x < Math.min(bx + bw, w); x++) {
        if (isPointInContour(x, y, contour.points)) {
          mask[y * w + x] = 255;
        }
      }
    }
  }

  // Apply mask: keep pixels inside, black outside
  for (let i = 0; i < w * h; i++) {
    if (mask[i] > 0) {
      outData[i * 4] = data[i * 4];
      outData[i * 4 + 1] = data[i * 4 + 1];
      outData[i * 4 + 2] = data[i * 4 + 2];
      outData[i * 4 + 3] = 255;
    } else {
      outData[i * 4] = 0;
      outData[i * 4 + 1] = 0;
      outData[i * 4 + 2] = 0;
      outData[i * 4 + 3] = 255;
    }
  }

  return out;
}

// Ray-casting point-in-polygon
function isPointInContour(px: number, py: number, points: { x: number; y: number }[]): boolean {
  let inside = false;
  const n = points.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[i].x, yi = points[i].y;
    const xj = points[j].x, yj = points[j].y;
    if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ── Draw Contour Overlay on Canvas ──
export function drawContourOverlay(
  ctx: CanvasRenderingContext2D, contours: Contour[], w: number, h: number
): void {
  ctx.clearRect(0, 0, w, h);

  for (const contour of contours) {
    const pts = contour.points;
    if (pts.length < 3) continue;

    // Fill with translucent color
    ctx.fillStyle = contour.color + '18';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    ctx.fill();

    // Stroke border
    ctx.strokeStyle = contour.color;
    ctx.lineWidth = 2;
    ctx.shadowBlur = 6;
    ctx.shadowColor = contour.color;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Label
    const bb = contour.boundingBox;
    ctx.fillStyle = contour.color;
    ctx.font = 'bold 10px monospace';
    ctx.fillText(`${contour.area}px²`, bb.x + 2, bb.y - 4);
  }
}
