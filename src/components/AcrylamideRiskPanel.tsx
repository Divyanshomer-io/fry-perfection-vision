import React from 'react';
import type { AcrylamideRisk } from '@/lib/cieDe2000';
import { AlertTriangle, Shield, ShieldAlert, ShieldCheck, ShieldX } from 'lucide-react';

interface AcrylamideRiskPanelProps {
  risk: AcrylamideRisk;
  deltaE: number;
}

const RISK_CONFIG: Record<string, { color: string; icon: typeof Shield; bgOpacity: string }> = {
  low: { color: 'hsl(142 70% 45%)', icon: ShieldCheck, bgOpacity: '0.12' },
  moderate: { color: 'hsl(86 60% 45%)', icon: Shield, bgOpacity: '0.12' },
  elevated: { color: 'hsl(42 95% 52%)', icon: AlertTriangle, bgOpacity: '0.12' },
  high: { color: 'hsl(25 90% 50%)', icon: ShieldAlert, bgOpacity: '0.15' },
  critical: { color: 'hsl(0 75% 55%)', icon: ShieldX, bgOpacity: '0.15' },
};

export function AcrylamideRiskPanel({ risk, deltaE }: AcrylamideRiskPanelProps) {
  const config = RISK_CONFIG[risk.level] || RISK_CONFIG.moderate;
  const Icon = config.icon;

  // EU benchmark bar position
  const euBenchmark = 500;
  const barPct = Math.min(100, (risk.estimatedPpb / (euBenchmark * 1.8)) * 100);
  const benchmarkPct = (euBenchmark / (euBenchmark * 1.8)) * 100;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-foreground tracking-wider">MAILLARD / ACRYLAMIDE</h3>
        <div className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5" style={{ color: config.color }} />
          <span className="text-xs font-display font-bold" style={{ color: config.color }}>
            {risk.level.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Main risk display */}
      <div className="flex items-center gap-3 rounded-lg px-3 py-2.5"
        style={{ background: config.color.replace(')', ` / ${config.bgOpacity})`), border: `1px solid ${config.color.replace(')', ' / 0.3)')}` }}>
        <div className="flex flex-col items-center">
          <span className="font-mono-custom text-xl font-bold" style={{ color: config.color }}>
            {risk.estimatedPpb}
          </span>
          <span className="text-xs text-muted-foreground">ppb est.</span>
        </div>
        <div className="flex-1 flex flex-col gap-1">
          <div className="text-xs" style={{ color: config.color }}>{risk.complianceStatus}</div>
          <div className="text-xs text-muted-foreground">
            Maillard Intensity: <span className="font-mono-custom">{(risk.maillardIntensity * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* Acrylamide scale bar */}
      <div className="flex flex-col gap-1">
        <div className="text-xs text-muted-foreground">Estimated Acrylamide Level</div>
        <div className="relative h-3 rounded-full overflow-hidden" style={{ background: 'hsl(220 15% 13%)' }}>
          {/* Gradient bar */}
          <div className="absolute inset-0 rounded-full overflow-hidden">
            <div className="h-full" style={{
              background: 'linear-gradient(to right, hsl(142 70% 45%), hsl(86 60% 45%), hsl(42 95% 52%), hsl(25 90% 50%), hsl(0 75% 55%))',
              width: '100%',
              opacity: 0.6,
            }} />
          </div>
          {/* Current value indicator */}
          <div className="absolute top-0 bottom-0 w-1 rounded-full"
            style={{ left: `${barPct}%`, background: config.color, boxShadow: `0 0 6px ${config.color}` }} />
          {/* EU benchmark line */}
          <div className="absolute top-0 bottom-0 w-px"
            style={{ left: `${benchmarkPct}%`, background: 'hsl(0 75% 55%)', opacity: 0.8 }} />
        </div>
        <div className="flex justify-between text-xs" style={{ fontSize: '8px' }}>
          <span className="text-muted-foreground">0 ppb</span>
          <span className="text-destructive">EU 500 ppb ↑</span>
          <span className="text-muted-foreground">900 ppb</span>
        </div>
      </div>

      {/* DE2000 metric */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>ΔE₀₀ from target golden: </span>
        <span className="font-mono-custom font-medium" style={{ color: deltaE < 10 ? 'hsl(142 70% 45%)' : deltaE < 25 ? 'hsl(42 95% 52%)' : 'hsl(0 75% 55%)' }}>
          {deltaE.toFixed(1)}
        </span>
      </div>
    </div>
  );
}
