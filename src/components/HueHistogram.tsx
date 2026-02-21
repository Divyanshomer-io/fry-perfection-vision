import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { AnalysisResult } from '@/lib/colorAnalysis';

interface HueHistogramProps {
  result: AnalysisResult;
}

function getHueColor(hueDegree: number): string {
  // Convert hue degree to HSL color for bar
  return `hsl(${hueDegree}, 80%, 50%)`;
}

interface HueTooltipProps {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string | number;
}

const CustomTooltip = ({ active, payload, label }: HueTooltipProps) => {
  if (active && payload && payload.length && payload[0].value !== undefined) {
    return (
      <div className="industrial-card px-3 py-2 text-xs">
        <p className="font-display font-semibold text-gold">Hue: {label}°–{Number(label) + 10}°</p>
        <p className="text-foreground">{payload[0].value.toFixed(2)}% of pixels</p>
      </div>
    );
  }
  return null;
};

export function HueHistogram({ result }: HueHistogramProps) {
  const data = useMemo(() => {
    return result.hueHistogram.map((pct, i) => ({
      hue: i * 10,
      percentage: pct,
      color: getHueColor(i * 10),
    }));
  }, [result.hueHistogram]);

  const medianBin = Math.floor(result.pixelStats.medianHue / 10);
  const peakBin = data.reduce((max, d, i) => d.percentage > data[max].percentage ? i : max, 0);

  // Target range for golden fries: 25°–45°
  const TARGET_MIN_BIN = 2; // 20°
  const TARGET_MAX_BIN = 4; // 40°

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-foreground tracking-wider">HUE DISTRIBUTION</h3>
        <div className="flex gap-3 text-xs">
          <span className="text-muted-foreground">
            Median: <span className="font-mono-custom text-gold">{result.pixelStats.medianHue.toFixed(0)}°</span>
          </span>
          <span className="text-muted-foreground">
            Peak: <span className="font-mono-custom" style={{ color: getHueColor(peakBin * 10) }}>{peakBin * 10}°</span>
          </span>
        </div>
      </div>

      {/* Color spectrum bar */}
      <div className="h-4 rounded-sm overflow-hidden flex">
        {data.map((d, i) => (
          <div
            key={i}
            style={{ flex: 1, backgroundColor: d.color, opacity: 0.8 }}
            title={`${d.hue}°: ${d.percentage.toFixed(1)}%`}
          />
        ))}
      </div>

      <div style={{ height: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="hue"
              tick={{ fontSize: 9, fill: 'hsl(215 12% 50%)' }}
              interval={5}
              tickFormatter={(v) => v === 0 || v % 60 === 0 ? `${v}°` : ''}
            />
            <YAxis tick={{ fontSize: 9, fill: 'hsl(215 12% 50%)' }} />
            <Tooltip content={<CustomTooltip />} />
            {/* Target zone overlay */}
            <Bar dataKey="percentage" radius={[1, 1, 0, 0]}>
              {data.map((entry, index) => {
                const isTarget = index >= TARGET_MIN_BIN && index <= TARGET_MAX_BIN;
                const isMedian = index === medianBin;
                return (
                  <Cell
                    key={`cell-${index}`}
                    fill={isMedian ? 'hsl(42 95% 65%)' : isTarget ? 'hsl(42 80% 50%)' : entry.color}
                    fillOpacity={isTarget ? 0.9 : 0.6}
                    stroke={isTarget ? 'hsl(42 95% 60%)' : 'none'}
                    strokeWidth={isTarget ? 0.5 : 0}
                  />
                );
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: 'hsl(42 95% 60%)', opacity: 0.9 }} />
          <span>Target Zone (25°–45°)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: 'hsl(42 95% 70%)' }} />
          <span>Median Hue</span>
        </div>
      </div>
    </div>
  );
}
