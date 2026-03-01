import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Upload, Camera, Loader2, CheckCircle, RotateCcw, ScanLine, ShieldCheck } from 'lucide-react';
import { analyzeImage, type AnalysisResult, type DefectRegion } from '@/lib/colorAnalysis';
import { DEFAULT_CALIBRATION, type CalibrationData } from '@/lib/calibration';
import { segmentFries, applyBlackoutMask, drawContourOverlay, type Contour, type SegmentationResult } from '@/lib/segmentation';

interface ImageAnalyzerProps {
  onAnalysisComplete: (result: AnalysisResult, imageData: ImageData, imageSrc: string) => void;
  calibration: CalibrationData;
  isAnalyzing: boolean;
  setIsAnalyzing: (v: boolean) => void;
}

type Stage = 'upload' | 'segmenting' | 'segmented' | 'analyzing';

const DEFECT_COLORS: Record<string, string> = {
  burnt: '#ff2222',
  dark: '#ff6600',
  light: '#22aaff',
  mottled: '#ffcc00',
  sugar_end: '#ff88ff',
  disease: '#cc44ff',
};

export function ImageAnalyzer({ onAnalysisComplete, calibration, isAnalyzing, setIsAnalyzing }: ImageAnalyzerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [defects, setDefects] = useState<DefectRegion[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);

  // State machine
  const [stage, setStage] = useState<Stage>('upload');
  const [segResult, setSegResult] = useState<SegmentationResult | null>(null);
  const [originalImageData, setOriginalImageData] = useState<ImageData | null>(null);

  const processImage = useCallback(async (file: File) => {
    const url = URL.createObjectURL(file);
    setImageSrc(url);
    setDefects([]);
    setStage('segmenting');

    const img = new Image();
    img.onload = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const scale = Math.min(1, 800 / Math.max(img.width, img.height));
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      setOriginalImageData(imageData);

      // Stage 1: Segmentation
      await new Promise(r => setTimeout(r, 50));
      const seg = segmentFries(imageData);
      setSegResult(seg);
      setStage('segmented');
    };
    img.src = url;
  }, []);

  // Draw contour overlay when segmented
  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    const main = canvasRef.current;
    if (!overlay || !main) return;
    overlay.width = main.width;
    overlay.height = main.height;
    const ctx = overlay.getContext('2d')!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (stage === 'segmented' && segResult) {
      drawContourOverlay(ctx, segResult.contours, main.width, main.height);
      return;
    }

    if (stage === 'analyzing' || (defects.length > 0 && showOverlay)) {
      // Draw defect overlay
      for (const defect of defects) {
        const color = DEFECT_COLORS[defect.type] || '#ff0000';
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.shadowBlur = 8;
        ctx.shadowColor = color;
        ctx.strokeRect(defect.x, defect.y, defect.width, defect.height);

        ctx.fillStyle = color;
        ctx.font = 'bold 9px monospace';
        ctx.shadowBlur = 0;
        const label = defect.type.toUpperCase().replace('_', ' ');
        ctx.fillText(label, defect.x + 2, defect.y - 2);
      }

      const cellSize = Math.max(8, Math.min(40, calibration.cellSizePx ?? 20));
      ctx.strokeStyle = 'rgba(0, 255, 100, 0.15)';
      ctx.lineWidth = 0.5;
      ctx.shadowBlur = 0;
      for (let x = 0; x < main.width; x += cellSize) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, main.height); ctx.stroke();
      }
      for (let y = 0; y < main.height; y += cellSize) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(main.width, y); ctx.stroke();
      }
    }
  }, [stage, segResult, defects, showOverlay, calibration.cellSizePx]);

  // Stage 3+4: Blackout mask → Analysis
  const handleConfirmAndAnalyze = useCallback(async () => {
    if (!segResult || !originalImageData || !canvasRef.current) return;

    setStage('analyzing');
    setIsAnalyzing(true);

    try {
      await new Promise(r => setTimeout(r, 50));

      // Stage 3: Apply blackout mask
      const maskedImageData = applyBlackoutMask(originalImageData, segResult.contours);

      // Draw masked image on canvas
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d')!;
      ctx.putImageData(maskedImageData, 0, 0);

      // Stage 4: Run analysis on masked image
      const cellSize = Math.max(8, Math.min(40, calibration.cellSizePx ?? 20));
      const result = await analyzeImage(maskedImageData, calibration.ppm, cellSize);
      setDefects(result.defects);
      onAnalysisComplete(result, maskedImageData, imageSrc!);
    } finally {
      setIsAnalyzing(false);
    }
  }, [segResult, originalImageData, calibration, onAnalysisComplete, setIsAnalyzing, imageSrc]);

  const handleReset = useCallback(() => {
    setImageSrc(null);
    setDefects([]);
    setStage('upload');
    setSegResult(null);
    setOriginalImageData(null);
  }, []);

  const handleReSegment = useCallback(async () => {
    if (!originalImageData || !canvasRef.current) return;
    
    // Redraw original image
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(originalImageData, 0, 0);
    
    setStage('segmenting');
    setDefects([]);
    await new Promise(r => setTimeout(r, 50));
    const seg = segmentFries(originalImageData);
    setSegResult(seg);
    setStage('segmented');
  }, [originalImageData]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) processImage(file);
  }, [processImage]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Upload zone */}
      {stage === 'upload' && !imageSrc && (
        <div
          className={`relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed transition-all duration-200 min-h-[300px] cursor-pointer ${
            isDragging
              ? 'border-primary bg-primary/10'
              : 'border-panel-border hover:border-primary/50 bg-panel/50'
          }`}
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="flex flex-col items-center gap-4 p-8 text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
              style={{ background: 'hsl(42 95% 52% / 0.15)', border: '1px solid hsl(42 95% 52% / 0.3)' }}>
              <Upload className="w-8 h-8 text-gold" />
            </div>
            <div>
              <p className="font-display text-lg font-semibold text-foreground">Drop Sample Image Here</p>
              <p className="text-sm text-muted-foreground mt-1">Supports JPG, PNG, WEBP — industrial tray or conveyor images</p>
            </div>
            <div className="flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Camera className="w-3 h-3" /> Camera capture</span>
              <span className="flex items-center gap-1"><Upload className="w-3 h-3" /> File upload</span>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}

      {/* Canvas display */}
      {imageSrc && (
        <div className="flex flex-col gap-2">
          {/* Stage indicator bar */}
          <div className="flex items-center gap-2 text-xs font-mono-custom">
            {/* Stage badges */}
            <div className="flex items-center gap-1 px-2 py-1 rounded" style={{
              background: stage === 'segmenting' ? 'hsl(42 95% 52% / 0.15)' : 
                          stage === 'segmented' ? 'hsl(170 80% 45% / 0.15)' : 
                          stage === 'analyzing' ? 'hsl(280 70% 55% / 0.15)' : 'hsl(142 70% 45% / 0.15)',
              border: `1px solid ${
                stage === 'segmenting' ? 'hsl(42 95% 52% / 0.4)' : 
                stage === 'segmented' ? 'hsl(170 80% 45% / 0.4)' : 
                stage === 'analyzing' ? 'hsl(280 70% 55% / 0.4)' : 'hsl(142 70% 45% / 0.4)'
              }`
            }}>
              {stage === 'segmenting' && <><Loader2 className="w-3 h-3 animate-spin" style={{ color: 'hsl(42 95% 52%)' }} /> <span style={{ color: 'hsl(42 95% 65%)' }}>SEGMENTING...</span></>}
              {stage === 'segmented' && <><ScanLine className="w-3 h-3" style={{ color: 'hsl(170 80% 50%)' }} /> <span style={{ color: 'hsl(170 80% 60%)' }}>BORDERS DETECTED</span></>}
              {stage === 'analyzing' && <><Loader2 className="w-3 h-3 animate-spin" style={{ color: 'hsl(280 70% 60%)' }} /> <span style={{ color: 'hsl(280 70% 70%)' }}>ANALYZING...</span></>}
              {stage !== 'segmenting' && stage !== 'segmented' && stage !== 'analyzing' && defects.length > 0 && (
                <><CheckCircle className="w-3 h-3" style={{ color: 'hsl(142 70% 50%)' }} /> <span style={{ color: 'hsl(142 70% 60%)' }}>ANALYSIS COMPLETE</span></>
              )}
            </div>

            {segResult && stage === 'segmented' && (
              <span className="text-muted-foreground">
                {segResult.contours.length} instance{segResult.contours.length !== 1 ? 's' : ''} • {segResult.processingTime.toFixed(0)}ms
              </span>
            )}

            <div className="flex-1" />

            {/* Action buttons based on stage */}
            {stage === 'segmented' && (
              <div className="flex gap-2">
                <button
                  onClick={handleConfirmAndAnalyze}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded font-display font-semibold tracking-wider transition-all"
                  style={{
                    background: 'var(--gradient-gold)',
                    color: 'hsl(220 20% 7%)',
                    boxShadow: '0 0 12px hsl(42 95% 52% / 0.3)',
                  }}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  CONFIRM & ANALYZE
                </button>
                <button
                  onClick={handleReSegment}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border transition-colors"
                  style={{ borderColor: 'hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}
                >
                  <RotateCcw className="w-3 h-3" />
                  RE-DETECT
                </button>
              </div>
            )}

            {defects.length > 0 && stage !== 'segmented' && (
              <button
                onClick={() => setShowOverlay(v => !v)}
                className={`text-xs px-3 py-1 rounded border transition-colors ${
                  showOverlay ? 'border-primary text-gold bg-primary/10' : 'border-border text-muted-foreground'
                }`}
              >
                {showOverlay ? 'OVERLAY ON' : 'OVERLAY OFF'}
              </button>
            )}

            <button
              onClick={handleReset}
              className="text-xs px-3 py-1 rounded border border-border text-muted-foreground hover:border-destructive hover:text-destructive transition-colors"
            >
              CLEAR
            </button>
          </div>

          {/* Segmentation info panel */}
          {stage === 'segmented' && segResult && segResult.contours.length > 0 && (
            <div className="flex flex-wrap gap-2 px-2 py-2 rounded-lg" style={{ 
              background: 'hsl(170 80% 45% / 0.06)', 
              border: '1px solid hsl(170 80% 45% / 0.2)' 
            }}>
              {segResult.contours.map((c, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: c.color + '55', border: `2px solid ${c.color}` }} />
                  <span className="font-mono-custom text-muted-foreground">
                    #{i + 1} ({c.area}px²)
                  </span>
                </div>
              ))}
            </div>
          )}

          {stage === 'segmented' && segResult && segResult.contours.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{
              background: 'hsl(42 95% 52% / 0.1)',
              border: '1px solid hsl(42 95% 52% / 0.3)',
              color: 'hsl(42 95% 65%)'
            }}>
              <ScanLine className="w-4 h-4" />
              <span>No fry instances detected. Try adjusting the image or use RE-DETECT.</span>
            </div>
          )}

          <div className="relative rounded-lg overflow-hidden" style={{ background: '#111' }}>
            {(stage === 'segmenting' || stage === 'analyzing') && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center scan-line"
                style={{ background: 'rgba(0,0,0,0.7)' }}>
                <Loader2 className="w-8 h-8 animate-spin text-gold mb-3" />
                <p className="font-display text-sm font-semibold text-gold">
                  {stage === 'segmenting' ? 'SEGMENTING INSTANCES...' : 'ANALYZING SAMPLE...'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {stage === 'segmenting' ? 'CLAHE + Watershed + Contour extraction' : 'Running CV pipeline on masked image'}
                </p>
              </div>
            )}
            <canvas ref={canvasRef} className="w-full block" />
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 w-full h-full"
              style={{ pointerEvents: 'none' }}
            />
          </div>

          {/* Defect Legend (only after analysis) */}
          {defects.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-1">
              {Object.entries(DEFECT_COLORS).map(([type, color]) => (
                <div key={type} className="flex items-center gap-1.5 text-xs">
                  <div className="w-3 h-3 rounded-sm border" style={{ backgroundColor: color + '33', borderColor: color }} />
                  <span className="text-muted-foreground capitalize">{type.replace('_', ' ')}</span>
                </div>
              ))}
            </div>
          )}

          {/* Re-upload */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-xs text-muted-foreground hover:text-gold transition-colors text-left"
          >
            + Upload new sample
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      )}
    </div>
  );
}
