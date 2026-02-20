import React from 'react';
import { AlertTriangle, CheckCircle, XCircle, TrendingDown, Brain } from 'lucide-react';
import type { AnalysisResult } from '@/lib/colorAnalysis';
import { getScoreColor, getScoreBg } from '@/lib/pqiEngine';
import { getMcdonaldsScoreLabel, getPQIStatus } from '@/lib/colorAnalysis';

interface PQIScoringProps {
  result: AnalysisResult;
}

interface AttributeRowProps {
  label: string;
  score: number;
  sublabel?: string;
  contribution?: number;
}

function AttributeRow({ label, score, sublabel, contribution }: AttributeRowProps) {
  const color = getScoreColor(score);
  const bg = getScoreBg(score);
  const deviation = Math.abs(score - 5);
  const barWidth = (1 - deviation / 4) * 100;

  return (
    <div className="flex flex-col gap-1.5 py-2 border-b border-panel-border last:border-0">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm font-medium text-foreground">{label}</span>
          {sublabel && <span className="text-xs text-muted-foreground ml-2">{sublabel}</span>}
        </div>
        <div className="flex items-center gap-2">
          {contribution !== undefined && (
            <span className="text-xs font-mono-custom text-muted-foreground">{contribution}%</span>
          )}
          <span className="text-xs text-muted-foreground max-w-[160px] text-right">{getMcdonaldsScoreLabel(score)}</span>
          <div className="w-8 h-8 rounded flex items-center justify-center font-display text-base font-bold"
            style={{ color, background: bg, border: `1px solid ${color}44` }}>
            {score}
          </div>
        </div>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'hsl(220 15% 13%)' }}>
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${barWidth}%`, background: color }} />
      </div>
    </div>
  );
}

export function PQIScoring({ result }: PQIScoringProps) {
  const scores = [result.processColorScore, result.hueScore, result.mottlingScore, result.defectScore];
  const pqiStatus = getPQIStatus(result.pqi);
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (result.pqi / 100) * circumference;

  const hasFailure = scores.some(s => s === 2 || s === 8);
  const hasRejection = scores.some(s => s === 1 || s === 9);
  const fuzzy = result.fuzzyPQI;

  return (
    <div className="flex flex-col gap-4">
      {/* PQI Gauge */}
      <div className="flex items-center gap-6">
        <div className="relative flex-shrink-0">
          <svg width="110" height="110" className="transform -rotate-90">
            <circle cx="55" cy="55" r="45" fill="none" stroke="hsl(220 15% 15%)" strokeWidth="8" />
            <circle cx="55" cy="55" r="45" fill="none" stroke={pqiStatus.color} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={circumference} strokeDashoffset={strokeDashoffset}
              style={{ transition: 'stroke-dashoffset 1s ease', filter: `drop-shadow(0 0 6px ${pqiStatus.color}88)` }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono-custom font-bold text-2xl" style={{ color: pqiStatus.color }}>
              {result.pqi}%
            </span>
            <span className="font-display text-xs font-semibold tracking-widest text-muted-foreground">PQI</span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            {hasRejection ? <XCircle className="w-4 h-4 text-destructive" />
              : hasFailure ? <AlertTriangle className="w-4 h-4" style={{ color: 'hsl(25 90% 50%)' }} />
              : result.pqi >= 75 ? <CheckCircle className="w-4 h-4" style={{ color: 'hsl(142 70% 45%)' }} />
              : <TrendingDown className="w-4 h-4" style={{ color: 'hsl(42 95% 52%)' }} />}
            <span className="font-display text-base font-bold tracking-wider" style={{ color: pqiStatus.color }}>
              {pqiStatus.label}
            </span>
          </div>

          {hasRejection && (
            <div className="text-xs px-2 py-1 rounded" style={{ background: 'hsl(0 75% 55% / 0.15)', border: '1px solid hsl(0 75% 55% / 0.3)', color: 'hsl(0 75% 65%)' }}>
              Score 1 or 9 detected — NOT McDonald's Quality
            </div>
          )}
          {hasFailure && !hasRejection && (
            <div className="text-xs px-2 py-1 rounded" style={{ background: 'hsl(25 90% 50% / 0.15)', border: '1px solid hsl(25 90% 50% / 0.3)', color: 'hsl(25 90% 60%)' }}>
              Score 2 or 8 detected — Quality Failure (25%)
            </div>
          )}

          {/* Fuzzy Logic badge */}
          {fuzzy && (
            <div className="flex items-center gap-1.5 text-xs mt-1">
              <Brain className="w-3 h-3" style={{ color: 'hsl(280 70% 60%)' }} />
              <span style={{ color: 'hsl(280 70% 65%)' }} className="font-display font-semibold">FUZZY LOGIC</span>
              <span className="text-muted-foreground">
                Base: {fuzzy.basePQI}% − Penalty: {fuzzy.interactionPenalty}%
              </span>
            </div>
          )}

          {/* Quick score overview */}
          <div className="flex gap-1.5 mt-1">
            {scores.map((s, i) => (
              <div key={i} className="w-7 h-7 rounded flex items-center justify-center text-xs font-display font-bold"
                style={{ color: getScoreColor(s), background: getScoreBg(s), border: `1px solid ${getScoreColor(s)}44` }}>
                {s}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Score breakdown with fuzzy contributions */}
      <div className="flex flex-col">
        <h4 className="text-xs font-semibold text-muted-foreground tracking-widest mb-2 uppercase">Attribute Scores</h4>
        <AttributeRow label="Process Color" score={result.processColorScore}
          sublabel={`USDA ${result.usdaColorScore.toFixed(2)}`}
          contribution={fuzzy?.attributeContributions.processColor} />
        <AttributeRow label="Flesh Hue" score={result.hueScore} sublabel="Farm Frites Chart"
          contribution={fuzzy?.attributeContributions.hue} />
        <AttributeRow label="Color Variation / Mottling" score={result.mottlingScore}
          sublabel="Contour-Weighted" contribution={fuzzy?.attributeContributions.mottling} />
        <AttributeRow label="Appearance Defects" score={result.defectScore}
          sublabel={`${result.defectCount} defects (${result.shadowCount} shadows filtered)`}
          contribution={fuzzy?.attributeContributions.defects} />
      </div>

      {/* PQI Formula note */}
      <div className="rounded-lg px-3 py-2 text-xs text-muted-foreground"
        style={{ background: 'hsl(220 15% 9%)', border: '1px solid hsl(220 15% 16%)' }}>
        <span className="text-gold font-mono-custom">PQI = </span>
        Fuzzy Logic Controller (Weighted Base − Interaction Penalty) &nbsp;|&nbsp;
        Failure → 25% &nbsp;|&nbsp; Rejection → 0%
      </div>
    </div>
  );
}
