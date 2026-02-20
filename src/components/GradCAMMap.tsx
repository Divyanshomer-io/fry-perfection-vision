import React, { useMemo } from 'react';

interface GradCAMMapProps {
  gradCAMData: number[][];
  reasoning: string[];
}

// Gradient: transparent blue → yellow → red (Grad-CAM style)
function gradCamColor(v: number): string {
  v = Math.max(0, Math.min(1, v));
  if (v < 0.2) return `rgba(0, 100, 255, ${v * 2})`;
  if (v < 0.5) {
    const t = (v - 0.2) / 0.3;
    const r = Math.round(t * 255);
    const g = Math.round(200 - t * 100);
    const b = Math.round(255 * (1 - t));
    return `rgba(${r}, ${g}, ${b}, ${0.4 + v * 0.5})`;
  }
  if (v < 0.75) {
    const t = (v - 0.5) / 0.25;
    return `rgba(255, ${Math.round(200 - t * 150)}, 0, ${0.6 + v * 0.3})`;
  }
  const t = (v - 0.75) / 0.25;
  return `rgba(255, ${Math.round(50 * (1 - t))}, 0, ${0.8 + v * 0.2})`;
}

export function GradCAMMap({ gradCAMData, reasoning }: GradCAMMapProps) {
  const rows = gradCAMData.length;
  const cols = gradCAMData[0]?.length || 0;
  
  const stats = useMemo(() => {
    const flat = gradCAMData.flat();
    const hotCells = flat.filter(v => v > 0.6).length;
    const warmCells = flat.filter(v => v > 0.3 && v <= 0.6).length;
    const totalCells = flat.length;
    return {
      hotPct: totalCells > 0 ? ((hotCells / totalCells) * 100).toFixed(1) : '0',
      warmPct: totalCells > 0 ? ((warmCells / totalCells) * 100).toFixed(1) : '0',
    };
  }, [gradCAMData]);

  if (rows === 0 || cols === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-foreground tracking-wider">GRAD-CAM ATTRIBUTION</h3>
        <div className="text-xs text-muted-foreground">
          <span className="text-destructive font-mono-custom">{stats.hotPct}%</span> hot /{' '}
          <span style={{ color: 'hsl(42 95% 52%)' }} className="font-mono-custom">{stats.warmPct}%</span> warm
        </div>
      </div>

      {/* Grad-CAM grid */}
      <div className="relative rounded overflow-hidden" style={{ paddingBottom: `${(rows / cols) * 100}%`, background: '#0a0a0a' }}>
        <div className="absolute inset-0 grid" style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
        }}>
          {gradCAMData.map((row, gy) =>
            row.map((val, gx) => (
              <div key={`${gy}-${gx}`}
                style={{ backgroundColor: gradCamColor(val) }}
                title={`Attribution (${gx},${gy}): ${(val * 100).toFixed(0)}%`}
              />
            ))
          )}
        </div>
      </div>

      {/* Color legend */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Low</span>
        <div className="flex-1 h-3 rounded-sm overflow-hidden flex">
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i} style={{ flex: 1, backgroundColor: gradCamColor(i / 19) }} />
          ))}
        </div>
        <span>High</span>
      </div>

      {/* Reasoning chain */}
      {reasoning.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg px-3 py-2"
          style={{ background: 'hsl(220 15% 9%)', border: '1px solid hsl(220 15% 16%)' }}>
          <div className="text-xs font-display font-semibold text-muted-foreground tracking-wider mb-0.5">
            REASONING CHAIN
          </div>
          {reasoning.map((r, i) => (
            <div key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
              <span className="text-gold mt-0.5" style={{ fontSize: '6px' }}>●</span>
              <span>{r}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
