import React, { useState, useEffect } from 'react';
import { Ruler, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { DEFAULT_CALIBRATION, type CalibrationData } from '@/lib/calibration';

interface CalibrationPanelProps {
  calibration: CalibrationData;
  onCalibrationChange: (cal: CalibrationData) => void;
}

export function CalibrationPanel({ calibration, onCalibrationChange }: CalibrationPanelProps) {
  const [refLength, setRefLength] = useState(calibration.referenceLength ?? 25.4);
  const [pixelLength, setPixelLength] = useState<number>(calibration.pixelLength ?? 96);
  const [cellSizePx, setCellSizePx] = useState<number>(calibration.cellSizePx ?? 20);

  useEffect(() => {
    setRefLength(calibration.referenceLength ?? 25.4);
    setPixelLength(calibration.pixelLength ?? 96);
    setCellSizePx(calibration.cellSizePx ?? 20);
  }, [calibration.referenceLength, calibration.pixelLength, calibration.cellSizePx]);

  const handleManualCalibrate = () => {
    if (pixelLength > 0 && refLength > 0) {
      const ppm = pixelLength / refLength;
      const cellSize = Math.max(8, Math.min(40, cellSizePx));
      onCalibrationChange({
        ppm,
        referenceLength: refLength,
        pixelLength,
        isCalibrated: true,
        cellSizePx: cellSize,
      });
      toast.success('Calibration applied. Re-analyze the image to use new settings.');
    }
  };

  const handleReset = () => {
    onCalibrationChange(DEFAULT_CALIBRATION);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Ruler className="w-4 h-4 text-gold" />
        <h3 className="font-display text-sm font-semibold tracking-wider">SPATIAL CALIBRATION</h3>
        <div
          className={`ml-auto text-xs px-2 py-0.5 rounded font-display font-semibold ${
            calibration.isCalibrated ? 'text-green-400' : 'text-yellow-500'
          }`}
          style={{
            background: calibration.isCalibrated ? 'hsl(142 70% 45% / 0.15)' : 'hsl(42 95% 52% / 0.15)',
            border: calibration.isCalibrated ? '1px solid hsl(142 70% 45% / 0.3)' : '1px solid hsl(42 95% 52% / 0.3)',
          }}
        >
          {calibration.isCalibrated ? 'CALIBRATED' : 'DEFAULT'}
        </div>
      </div>

      {/* PPM display */}
      <div className="industrial-card px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">Pixels Per Millimeter</div>
          <div className="font-mono-custom text-2xl text-gold">{calibration.ppm.toFixed(3)}</div>
          <div className="text-xs text-muted-foreground">px/mm</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Reference</div>
          <div className="font-mono-custom text-sm text-foreground">{calibration.referenceLength.toFixed(1)} mm</div>
          <div className="text-xs text-muted-foreground">= {calibration.pixelLength.toFixed(0)} px</div>
        </div>
      </div>

      {/* Manual calibration */}
      <div className="flex flex-col gap-3">
        <div className="text-xs text-muted-foreground">Manual Calibration</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Known length (mm)</label>
            <input
              type="number"
              value={refLength}
              onChange={e => setRefLength(Number(e.target.value))}
              className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm font-mono-custom text-foreground focus:border-primary outline-none"
              min={1}
              step={0.5}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Pixel length (px)</label>
            <input
              type="number"
              value={pixelLength}
              onChange={e => setPixelLength(Number(e.target.value))}
              className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm font-mono-custom text-foreground focus:border-primary outline-none"
              min={1}
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Analysis cell size (px)</label>
          <input
            type="number"
            value={cellSizePx}
            onChange={e => setCellSizePx(Number(e.target.value))}
            className="w-full rounded border border-border bg-input px-2 py-1.5 text-sm font-mono-custom text-foreground focus:border-primary outline-none"
            min={8}
            max={40}
            step={2}
          />
          <div className="text-xs text-muted-foreground mt-0.5">Smaller = finer defect detection, more computation (8–40)</div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleManualCalibrate}
            className="flex-1 py-1.5 rounded font-display text-sm font-semibold transition-colors"
            style={{
              background: 'hsl(42 95% 52% / 0.15)',
              border: '1px solid hsl(42 95% 52% / 0.4)',
              color: 'hsl(42 95% 65%)',
            }}
          >
            APPLY CALIBRATION
          </button>
          <button
            onClick={handleReset}
            className="px-3 py-1.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Common reference sizes */}
      <div className="flex flex-col gap-2">
        <div className="text-xs text-muted-foreground">Quick Reference (McCain Strip Sizes)</div>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: '1/4" strip', mm: 6.35 },
            { label: '3/8" strip', mm: 9.53 },
            { label: '7/16" strip', mm: 11.11 },
            { label: '9/16" strip', mm: 14.29 },
          ].map(ref => (
            <button
              key={ref.label}
              onClick={() => setRefLength(ref.mm)}
              className="text-xs px-2 py-1.5 rounded border border-border text-muted-foreground hover:border-primary hover:text-gold transition-colors text-left"
            >
              {ref.label} = {ref.mm.toFixed(2)}mm
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
