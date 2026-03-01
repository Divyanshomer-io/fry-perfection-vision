/**
 * Instance Segmentation Engine V2
 * 
 * Fixed: proper Moore boundary tracing, HSV-based fry detection,
 * connected component labeling, and clean contour rendering.
 */

export interface Contour {
  points: { x: number; y: number }[];
  boundingBox: { x: number; y: number; w: number; h: number };
  area: number;
  color: string;
}

export interface SegmentationResult {
  contours: Contour[];
  mask: Uint8Array;
  width: number;
  height: number;
  processingTime: number;
}

// ── RGB → HSV ──
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  return [h, s, v];
}

// ── Step 1: Color-based fry detection ──
// Fries are golden/yellow/brown. Background can be anything.
// We detect fry-like pixels based on hue + saturation + value ranges
function createFryMask(data: Uint8Array, w: number, h: number): Uint8Array {
  const mask = new Uint8Array(w * h);
  
  // First pass: collect stats on all pixels to determine background
  const hueHist = new Float32Array(360);
  const valHist = new Float32Array(256);
  let totalPx = 0;
  
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const a = data[i * 4 + 3];
    if (a < 128) continue;
    const [hh, ss, vv] = rgbToHsv(r, g, b);
    if (ss > 0.05) hueHist[hh]++;
    valHist[Math.round(vv * 255)]++;
    totalPx++;
  }
  
  // Find dominant background hue (highest peak that's NOT in fry range)
  // Fry hues are roughly 15-55 (golden/yellow/brown)
  let bgHue = -1, bgHueCount = 0;
  // Smooth hue histogram
  for (let h = 0; h < 360; h++) {
    let sum = 0;
    for (let dh = -5; dh <= 5; dh++) {
      sum += hueHist[(h + dh + 360) % 360];
    }
    if (sum > bgHueCount) {
      bgHueCount = sum;
      bgHue = h;
    }
  }
  
  // Determine if background is colored or neutral
  const bgIsFryLike = bgHue >= 15 && bgHue <= 55;
  
  // Second pass: classify each pixel
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const a = data[i * 4 + 3];
    if (a < 128) continue;
    
    const [hh, ss, vv] = rgbToHsv(r, g, b);
    
    // A pixel is "fry" if it matches fry color profile
    // Fries: hue 10-65 (orange-brown to yellow), sat 0.15-0.85, val 0.25-0.95
    const isFryHue = (hh >= 10 && hh <= 65) || (hh >= 350 || hh <= 10); // include reddish-brown
    const isFrySat = ss >= 0.12 && ss <= 0.90;
    const isFryVal = vv >= 0.20 && vv <= 0.95;
    
    // Also include very dark burnt regions (low V, low S)
    const isBurnt = vv < 0.25 && ss < 0.4 && vv > 0.03;
    
    // Exclude background: if pixel hue is close to bgHue and background isn't fry-colored
    let isBackground = false;
    if (!bgIsFryLike && bgHue >= 0) {
      let hueDist = Math.abs(hh - bgHue);
      if (hueDist > 180) hueDist = 360 - hueDist;
      // If hue is within 20° of background hue, likely background
      if (hueDist < 20 && ss > 0.08) {
        isBackground = true;
      }
    }
    
    // Exclude very white/bright unsaturated pixels (paper/tray highlights)
    const isWhite = vv > 0.85 && ss < 0.10;
    
    if (!isBackground && !isWhite && ((isFryHue && isFrySat && isFryVal) || isBurnt)) {
      mask[i] = 255;
    }
  }
  
  return mask;
}

// ── Morphological operations ──
function dilate(mask: Uint8Array, w: number, h: number, k: number = 3): Uint8Array {
  const out = new Uint8Array(mask.length);
  const half = Math.floor(k / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let maxVal = 0;
      for (let ky = -half; ky <= half; ky++) {
        for (let kx = -half; kx <= half; kx++) {
          const ny = y + ky, nx = x + kx;
          if (ny >= 0 && ny < h && nx >= 0 && nx < w)
            maxVal = Math.max(maxVal, mask[ny * w + nx]);
        }
      }
      out[y * w + x] = maxVal;
    }
  }
  return out;
}

function erode(mask: Uint8Array, w: number, h: number, k: number = 3): Uint8Array {
  const out = new Uint8Array(mask.length);
  const half = Math.floor(k / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let minVal = 255;
      for (let ky = -half; ky <= half; ky++) {
        for (let kx = -half; kx <= half; kx++) {
          const ny = y + ky, nx = x + kx;
          if (ny >= 0 && ny < h && nx >= 0 && nx < w)
            minVal = Math.min(minVal, mask[ny * w + nx]);
        }
      }
      out[y * w + x] = minVal;
    }
  }
  return out;
}

// ── Connected Component Labeling (4-connected) ──
function connectedComponents(mask: Uint8Array, w: number, h: number): { labels: Int32Array; count: number } {
  const labels = new Int32Array(w * h);
  let nextLabel = 1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (mask[idx] === 0 || labels[idx] !== 0) continue;

      // BFS flood fill
      const label = nextLabel++;
      const queue: number[] = [idx];
      labels[idx] = label;

      while (queue.length > 0) {
        const ci = queue.pop()!;
        const cy = Math.floor(ci / w), cx = ci % w;

        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          const ni = ny * w + nx;
          if (mask[ni] > 0 && labels[ni] === 0) {
            labels[ni] = label;
            queue.push(ni);
          }
        }
      }
    }
  }

  return { labels, count: nextLabel - 1 };
}

// ── Moore Boundary Tracing ──
// Traces the outer boundary of a single labeled region
function traceBoundary(
  labels: Int32Array, w: number, h: number, label: number
): { x: number; y: number }[] {
  // Find starting pixel: topmost, then leftmost pixel of this label
  let startX = -1, startY = -1;
  outer:
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (labels[y * w + x] === label) {
        startX = x;
        startY = y;
        break outer;
      }
    }
  }
  if (startX < 0) return [];

  // Moore neighbor tracing
  // 8-connected neighbors in clockwise order starting from left
  const dx = [-1, -1, 0, 1, 1, 1, 0, -1];
  const dy = [0, -1, -1, -1, 0, 1, 1, 1];

  const boundary: { x: number; y: number }[] = [];
  let cx = startX, cy = startY;
  let dir = 0; // start looking left
  const maxIter = w * h * 2; // safety limit
  let iter = 0;

  do {
    boundary.push({ x: cx, y: cy });

    // Search for next boundary pixel
    // Start from (dir + 5) % 8 to backtrack properly
    let searchDir = (dir + 5) % 8;
    let found = false;

    for (let i = 0; i < 8; i++) {
      const nd = (searchDir + i) % 8;
      const nx = cx + dx[nd], ny = cy + dy[nd];

      if (nx >= 0 && nx < w && ny >= 0 && ny < h && labels[ny * w + nx] === label) {
        cx = nx;
        cy = ny;
        dir = nd;
        found = true;
        break;
      }
    }

    if (!found) break;
    iter++;
  } while ((cx !== startX || cy !== startY) && iter < maxIter);

  return boundary;
}

// ── Simplify contour points (Ramer-Douglas-Peucker) ──
function simplifyContour(
  points: { x: number; y: number }[], epsilon: number
): { x: number; y: number }[] {
  if (points.length < 3) return points;

  // Find the point with the maximum distance from the line between first and last
  let maxDist = 0, maxIdx = 0;
  const start = points[0], end = points[points.length - 1];
  const dx = end.x - start.x, dy = end.y - start.y;
  const lenSq = dx * dx + dy * dy;

  for (let i = 1; i < points.length - 1; i++) {
    let dist: number;
    if (lenSq === 0) {
      dist = Math.hypot(points[i].x - start.x, points[i].y - start.y);
    } else {
      const t = Math.max(0, Math.min(1, ((points[i].x - start.x) * dx + (points[i].y - start.y) * dy) / lenSq));
      const projX = start.x + t * dx, projY = start.y + t * dy;
      dist = Math.hypot(points[i].x - projX, points[i].y - projY);
    }
    if (dist > maxDist) { maxDist = dist; maxIdx = i; }
  }

  if (maxDist > epsilon) {
    const left = simplifyContour(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyContour(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [start, end];
}

// ── Extract contours from labeled components ──
function extractContours(
  labels: Int32Array, w: number, h: number, componentCount: number
): Contour[] {
  const contourColors = [
    '#00ffcc', '#ff6b35', '#00d4ff', '#ff3366', '#88ff00',
    '#ff00aa', '#00ff88', '#ffaa00', '#6644ff', '#ff4444',
    '#00ffaa', '#dd44ff', '#44ddff', '#ffdd00', '#ff0066',
  ];

  const contours: Contour[] = [];

  for (let label = 1; label <= componentCount; label++) {
    // Compute area and bounding box
    let area = 0, minX = w, minY = h, maxX = 0, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (labels[y * w + x] !== label) continue;
        area++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }

    // Filter: minimum area
    if (area < 300) continue;

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;

    // Filter: reject very square + small objects (likely markers/noise)
    const aspect = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh));
    if (aspect < 1.3 && area < 2000) continue;

    // Trace boundary
    let boundary = traceBoundary(labels, w, h, label);
    if (boundary.length < 10) continue;

    // Simplify contour
    const epsilon = Math.max(1.5, Math.sqrt(area) / 25);
    boundary = simplifyContour(boundary, epsilon);

    // Need at least 4 points for a meaningful contour
    if (boundary.length < 4) continue;

    contours.push({
      points: boundary,
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

  // Step 1: Color-based fry mask
  let mask = createFryMask(data as unknown as Uint8Array, w, h);

  // Step 2: Morphological cleanup
  // Close small gaps in fry regions
  mask = dilate(mask, w, h, 5);
  mask = erode(mask, w, h, 5);
  // Remove small noise
  mask = erode(mask, w, h, 3);
  mask = dilate(mask, w, h, 3);

  // Step 3: Erode 2x for shadow buffer (shrink borders inward ~2-3px)
  mask = erode(mask, w, h, 3);
  mask = erode(mask, w, h, 3);

  // Step 4: Connected component labeling
  const { labels, count } = connectedComponents(mask, w, h);

  // Step 5: Extract contours using Moore boundary tracing
  const contours = extractContours(labels, w, h, count);

  const processingTime = performance.now() - start;
  return { contours, mask, width: w, height: h, processingTime };
}

// ── Apply Binary Mask (Blackout) ──
export function applyBlackoutMask(
  imageData: ImageData, contours: Contour[]
): ImageData {
  const { data, width: w, height: h } = imageData;
  const out = new ImageData(w, h);
  const outData = out.data;

  // Build mask from contour fill using scanline
  const mask = new Uint8Array(w * h);

  for (const contour of contours) {
    const pts = contour.points;
    if (pts.length < 3) continue;

    // Scanline fill using ray-casting
    const bb = contour.boundingBox;
    for (let y = bb.y; y < Math.min(bb.y + bb.h, h); y++) {
      // Count crossings for each x
      for (let x = bb.x; x < Math.min(bb.x + bb.w, w); x++) {
        if (isPointInPolygon(x, y, pts)) {
          mask[y * w + x] = 255;
        }
      }
    }
  }

  // Apply: keep inside, black outside
  for (let i = 0; i < w * h; i++) {
    if (mask[i] > 0) {
      outData[i * 4] = data[i * 4];
      outData[i * 4 + 1] = data[i * 4 + 1];
      outData[i * 4 + 2] = data[i * 4 + 2];
      outData[i * 4 + 3] = 255;
    } else {
      outData[i * 4 + 3] = 255; // black
    }
  }

  return out;
}

function isPointInPolygon(px: number, py: number, pts: { x: number; y: number }[]): boolean {
  let inside = false;
  const n = pts.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const yi = pts[i].y, yj = pts[j].y;
    if ((yi > py) !== (yj > py)) {
      const xi = pts[i].x, xj = pts[j].x;
      if (px < (xj - xi) * (py - yi) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

// ── Draw Contour Overlay ──
export function drawContourOverlay(
  ctx: CanvasRenderingContext2D, contours: Contour[], w: number, h: number
): void {
  ctx.clearRect(0, 0, w, h);

  for (const contour of contours) {
    const pts = contour.points;
    if (pts.length < 3) continue;

    // Semi-transparent fill
    ctx.fillStyle = contour.color + '22';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    ctx.fill();

    // Solid stroke
    ctx.strokeStyle = contour.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.shadowBlur = 4;
    ctx.shadowColor = contour.color;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Area label at top of bounding box
    const bb = contour.boundingBox;
    ctx.fillStyle = contour.color;
    ctx.font = 'bold 11px monospace';
    ctx.fillText(`${contour.area}px²`, bb.x + 4, bb.y - 6);
  }
}
