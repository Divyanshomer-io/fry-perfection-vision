import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Upload, Camera, ZapOff, Loader2 } from 'lucide-react';
import { analyzeImage, type AnalysisResult, type DefectRegion } from '@/lib/colorAnalysis';
import { DEFAULT_CALIBRATION, type CalibrationData } from '@/lib/calibration';

interface ImageAnalyzerProps {
  onAnalysisComplete: (result: AnalysisResult, imageData: ImageData, imageSrc: string) => void;
  calibration: CalibrationData;
  isAnalyzing: boolean;
  setIsAnalyzing: (v: boolean) => void;
}

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

  const processImage = useCallback(async (file: File) => {
    const url = URL.createObjectURL(file);
    setImageSrc(url);

    const img = new Image();
    img.onload = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Scale to max 800px for performance
      const scale = Math.min(1, 800 / Math.max(img.width, img.height));
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      setIsAnalyzing(true);
      try {
        // Small delay for UI to update
        await new Promise(r => setTimeout(r, 50));
        const cellSize = Math.max(8, Math.min(40, calibration.cellSizePx ?? 20));
        const result = await analyzeImage(imageData, calibration.ppm, cellSize);
        setDefects(result.defects);
        onAnalysisComplete(result, imageData, url);
      } finally {
        setIsAnalyzing(false);
      }
    };
    img.src = url;
  }, [calibration.ppm, calibration.cellSizePx, onAnalysisComplete, setIsAnalyzing]);

  // Draw defect overlay
  useEffect(() => {
    const overlay = overlayCanvasRef.current;
    const main = canvasRef.current;
    if (!overlay || !main || defects.length === 0) return;

    overlay.width = main.width;
    overlay.height = main.height;
    const ctx = overlay.getContext('2d')!;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (!showOverlay) return;

    for (const defect of defects) {
      const color = DEFECT_COLORS[defect.type] || '#ff0000';
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 8;
      ctx.shadowColor = color;
      ctx.strokeRect(defect.x, defect.y, defect.width, defect.height);

      // Label
      ctx.fillStyle = color;
      ctx.font = 'bold 9px monospace';
      ctx.shadowBlur = 0;
      const label = defect.type.toUpperCase().replace('_', ' ');
      ctx.fillText(label, defect.x + 2, defect.y - 2);
    }

    // Draw fry analysis grid (match calibration cell size)
    const cellSize = Math.max(8, Math.min(40, calibration.cellSizePx ?? 20));
    ctx.strokeStyle = 'rgba(0, 255, 100, 0.15)';
    ctx.lineWidth = 0.5;
    ctx.shadowBlur = 0;
    for (let x = 0; x < main.width; x += cellSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, main.height);
      ctx.stroke();
    }
    for (let y = 0; y < main.height; y += cellSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(main.width, y);
      ctx.stroke();
    }
  }, [defects, showOverlay, calibration.cellSizePx]);

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
      {!imageSrc && (
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
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono-custom text-muted-foreground">ANALYSIS OVERLAY</span>
            <div className="flex gap-2">
              <button
                onClick={() => setShowOverlay(v => !v)}
                className={`text-xs px-3 py-1 rounded border transition-colors ${
                  showOverlay ? 'border-primary text-gold bg-primary/10' : 'border-border text-muted-foreground'
                }`}
              >
                {showOverlay ? 'OVERLAY ON' : 'OVERLAY OFF'}
              </button>
              <button
                onClick={() => { setImageSrc(null); setDefects([]); }}
                className="text-xs px-3 py-1 rounded border border-border text-muted-foreground hover:border-destructive hover:text-destructive transition-colors"
              >
                CLEAR
              </button>
            </div>
          </div>

          <div className="relative rounded-lg overflow-hidden" style={{ background: '#111' }}>
            {isAnalyzing && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center scan-line"
                style={{ background: 'rgba(0,0,0,0.7)' }}>
                <Loader2 className="w-8 h-8 animate-spin text-gold mb-3" />
                <p className="font-display text-sm font-semibold text-gold">ANALYZING SAMPLE...</p>
                <p className="text-xs text-muted-foreground mt-1">Running CV pipeline</p>
              </div>
            )}
            <canvas ref={canvasRef} className="w-full block" />
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0 w-full h-full"
              style={{ pointerEvents: 'none' }}
            />
          </div>

          {/* Defect Legend */}
          <div className="flex flex-wrap gap-2 mt-1">
            {Object.entries(DEFECT_COLORS).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1.5 text-xs">
                <div className="w-3 h-3 rounded-sm border" style={{ backgroundColor: color + '33', borderColor: color }} />
                <span className="text-muted-foreground capitalize">{type.replace('_', ' ')}</span>
              </div>
            ))}
          </div>

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
