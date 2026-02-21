import React, { useState } from 'react';
import { Download, Trash2, Clock, BarChart2, FileSpreadsheet } from 'lucide-react';
import type { BatchRecord } from '@/lib/pqiEngine';
import { generateCSVReport, downloadCSV, getScoreColor } from '@/lib/pqiEngine';
import { downloadMcFryExcel } from '@/lib/excelExport';
import { getPQIStatus } from '@/lib/colorAnalysis';

interface BatchReportProps {
  records: BatchRecord[];
  onClear: () => void;
}

export function BatchReport({ records, onClear }: BatchReportProps) {
  const [sortBy, setSortBy] = useState<'timestamp' | 'pqi' | 'defects'>('timestamp');

  const sorted = [...records].sort((a, b) => {
    if (sortBy === 'pqi') return b.pqi - a.pqi;
    if (sortBy === 'defects') return b.defectCount - a.defectCount;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  const avgPqi = records.length > 0 ? records.reduce((s, r) => s + r.pqi, 0) / records.length : 0;
  const avgDefects = records.length > 0 ? records.reduce((s, r) => s + r.defectCount, 0) / records.length : 0;
  const passRate = records.length > 0 ? (records.filter(r => r.pqi >= 75).length / records.length) * 100 : 0;

  const handleExportCSV = () => {
    const csv = generateCSVReport(records);
    const now = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    downloadCSV(csv, `mccain_batch_report_${now}.csv`);
  };

  const handleExportExcel = () => {
    const now = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    downloadMcFryExcel(records, `mcfry_batch_${now}.xlsx`);
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Summary stats */}
      {records.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="industrial-card px-3 py-2 text-center">
            <div className="font-mono-custom text-lg text-gold">{avgPqi.toFixed(0)}%</div>
            <div className="text-xs text-muted-foreground">Avg PQI</div>
          </div>
          <div className="industrial-card px-3 py-2 text-center">
            <div className="font-mono-custom text-lg" style={{ color: 'hsl(142 70% 45%)' }}>{passRate.toFixed(0)}%</div>
            <div className="text-xs text-muted-foreground">Pass Rate</div>
          </div>
          <div className="industrial-card px-3 py-2 text-center">
            <div className="font-mono-custom text-lg" style={{ color: 'hsl(0 75% 55%)' }}>{avgDefects.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground">Avg Defects</div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-gold" />
          <span className="font-display text-sm font-semibold tracking-wider">BATCH LOG</span>
          <span className="text-xs px-2 py-0.5 rounded font-mono-custom"
            style={{ background: 'hsl(42 95% 52% / 0.15)', color: 'hsl(42 95% 65%)', border: '1px solid hsl(42 95% 52% / 0.3)' }}>
            {records.length} records
          </span>
        </div>
        <div className="flex gap-2">
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="text-xs px-2 py-1 rounded border border-border bg-background text-muted-foreground"
          >
            <option value="timestamp">Sort: Time</option>
            <option value="pqi">Sort: PQI</option>
            <option value="defects">Sort: Defects</option>
          </select>
          {records.length > 0 && (
            <>
              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1 text-xs px-3 py-1 rounded border border-primary text-gold hover:bg-primary/10 transition-colors"
              >
                <Download className="w-3 h-3" /> Export CSV
              </button>
              <button
                onClick={handleExportExcel}
                className="flex items-center gap-1 text-xs px-3 py-1 rounded border border-primary text-gold hover:bg-primary/10 transition-colors"
              >
                <FileSpreadsheet className="w-3 h-3" /> Export McFry Excel
              </button>
              <button
                onClick={onClear}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-border text-muted-foreground hover:border-destructive hover:text-destructive transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Records list */}
      {records.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 py-12">
          <Clock className="w-8 h-8 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">No analyses logged yet</p>
          <p className="text-xs text-muted-foreground opacity-70">Analyze an image to begin batch logging</p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5 overflow-y-auto max-h-96">
          {sorted.map(record => {
            const status = getPQIStatus(record.pqi);
            return (
              <div
                key={record.id}
                className="flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors hover:border-primary/30"
                style={{ background: 'hsl(220 18% 9%)', borderColor: 'hsl(220 15% 16%)' }}
              >
                {/* PQI badge */}
                <div
                  className="w-10 h-10 rounded flex items-center justify-center font-mono-custom text-sm font-bold flex-shrink-0"
                  style={{ background: status.color + '22', border: `1px solid ${status.color}55`, color: status.color }}
                >
                  {record.pqi}%
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-foreground truncate">{record.imageName}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded font-display font-semibold"
                      style={{ background: status.color + '22', color: status.color }}>
                      {status.label}
                    </span>
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                    <span>Hue: <span className="font-mono-custom text-gold">{record.medianHue.toFixed(0)}°</span></span>
                    <span>Defects: <span className="font-mono-custom text-destructive">{record.defectCount}</span></span>
                    <span>Agtron: <span className="font-mono-custom" style={{ color: 'hsl(210 80% 65%)' }}>{record.agtronScore.toFixed(0)}</span></span>
                  </div>
                </div>

                {/* Score chips */}
                <div className="flex gap-1 flex-shrink-0">
                  {[record.processColorScore, record.hueScore, record.mottlingScore, record.defectScore].map((s, i) => (
                    <div
                      key={i}
                      className="w-6 h-6 rounded text-xs flex items-center justify-center font-display font-bold"
                      style={{ color: getScoreColor(s), background: getScoreColor(s) + '22' }}
                    >
                      {s}
                    </div>
                  ))}
                </div>

                <div className="text-xs text-muted-foreground flex-shrink-0 font-mono-custom">
                  {new Date(record.timestamp).toLocaleTimeString()}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
