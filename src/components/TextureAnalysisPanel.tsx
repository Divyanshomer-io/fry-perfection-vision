import React from 'react';
import type { TextureAnalysis } from '@/lib/fftAnalysis';

interface TextureAnalysisPanelProps {
  texture: TextureAnalysis;
}

const TEXTURE_COLORS: Record<string, string> = {
  crispy: 'hsl(142 70% 45%)',
  normal: 'hsl(210 80% 60%)',
  soft: 'hsl(42 95% 52%)',
  soggy: 'hsl(0 75% 55%)',
};

export function TextureAnalysisPanel({ texture }: TextureAnalysisPanelProps) {
  const color = TEXTURE_COLORS[texture.textureClass] || 'hsl(210 80% 60%)';
  
  // Spectral profile visualization (simplified bar chart)
  const profileBars = texture.spectralProfile.length > 0
    ? texture.spectralProfile.filter((_, i) => i % Math.max(1, Math.floor(texture.spectralProfile.length / 32)) === 0).slice(0, 32)
    : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-foreground tracking-wider">TEXTURE FFT ANALYSIS</h3>
        <span className="text-xs font-display font-bold px-2 py-0.5 rounded"
          style={{ color, background: color.replace(')', ' / 0.15)'), border: `1px solid ${color.replace(')', ' / 0.4)')}` }}>
          {texture.textureClass.toUpperCase()}
        </span>
      </div>

      {/* Crispness gauge */}
      <div className="flex items-center gap-3">
        <div className="relative w-16 h-16 flex-shrink-0">
          <svg width="64" height="64" className="transform -rotate-90">
            <circle cx="32" cy="32" r="26" fill="none" stroke="hsl(220 15% 15%)" strokeWidth="6" />
            <circle cx="32" cy="32" r="26" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 26}
              strokeDashoffset={2 * Math.PI * 26 * (1 - texture.crispnessScore / 100)}
              style={{ transition: 'stroke-dashoffset 1s ease', filter: `drop-shadow(0 0 4px ${color}88)` }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono-custom font-bold text-sm" style={{ color }}>{texture.crispnessScore}</span>
            <span className="text-xs text-muted-foreground" style={{ fontSize: '8px' }}>CRISP</span>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-1.5">
          <div className="text-xs text-muted-foreground">
            Crust Micro-topography: <span className="font-mono-custom" style={{ color }}>{(texture.crustMicroTopography * 100).toFixed(0)}%</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Dominant Freq: <span className="font-mono-custom text-foreground">{(texture.dominantFrequency * 100).toFixed(1)} Hz (norm)</span>
          </div>
        </div>
      </div>

      {/* Spectral energy bands */}
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground mb-1">Spectral Energy Distribution</div>
        {([
          { label: 'Low (Soggy)', value: texture.spectralEnergy.lowFreq, color: 'hsl(0 75% 55%)' },
          { label: 'Mid (Normal)', value: texture.spectralEnergy.midFreq, color: 'hsl(42 95% 52%)' },
          { label: 'High (Crispy)', value: texture.spectralEnergy.highFreq, color: 'hsl(142 70% 45%)' },
        ] as const).map(band => (
          <div key={band.label} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-20 flex-shrink-0">{band.label}</span>
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'hsl(220 15% 13%)' }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${band.value * 100}%`, background: band.color }} />
            </div>
            <span className="text-xs font-mono-custom w-10 text-right" style={{ color: band.color }}>
              {(band.value * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>

      {/* Spectral profile mini-visualization */}
      {profileBars.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-xs text-muted-foreground">FFT Magnitude Spectrum</div>
          <div className="flex items-end gap-px h-10 rounded overflow-hidden" style={{ background: 'hsl(220 15% 8%)' }}>
            {profileBars.map((v, i) => {
              const barColor = i < profileBars.length / 3 ? 'hsl(0 60% 50%)'
                : i < (profileBars.length * 2) / 3 ? 'hsl(42 80% 50%)'
                : 'hsl(142 60% 45%)';
              return (
                <div key={i} className="flex-1 rounded-t-sm transition-all"
                  style={{ height: `${Math.max(2, v * 100)}%`, background: barColor, opacity: 0.7 + v * 0.3 }} />
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-muted-foreground" style={{ fontSize: '8px' }}>
            <span>Low Freq</span>
            <span>High Freq</span>
          </div>
        </div>
      )}
    </div>
  );
}
