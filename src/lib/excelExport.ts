// McFry-style Excel export for batch analysis results
// Matches McDonald's McFry tool spreadsheet layout

import * as XLSX from 'xlsx';
import type { BatchRecord } from './pqiEngine';

/** McFry tool columns aligned with industry standard */
const MCFRY_HEADERS = [
  'Sample ID',
  'Date/Time',
  'Batch ID',
  'Image Name',
  'Median Hue (°)',
  'PQI (%)',
  'Defect Count',
  'Process Color',
  'Hue Score',
  'Mottling Score',
  'Defect Score',
  'Agtron',
  'USDA Label',
  'Status',
] as const;

/**
 * Generate McFry-style Excel workbook from batch records
 * Returns Blob for download
 */
export function generateMcFryExcel(records: BatchRecord[]): Blob {
  const wsData: (string | number)[][] = [MCFRY_HEADERS as unknown as string[]];

  for (const r of records) {
    wsData.push([
      r.id,
      r.timestamp,
      r.batchId,
      r.imageName,
      r.medianHue,
      r.pqi,
      r.defectCount,
      r.processColorScore,
      r.hueScore,
      r.mottlingScore,
      r.defectScore,
      r.agtronScore,
      r.usdaLabel,
      r.status,
    ]);
  }

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  const colWidths = [
    { wch: 14 },
    { wch: 22 },
    { wch: 12 },
    { wch: 20 },
    { wch: 12 },
    { wch: 8 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
    { wch: 12 },
    { wch: 8 },
    { wch: 24 },
    { wch: 14 },
  ];
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Analysis Results');

  if (records.length > 0) {
    const avgPqi = records.reduce((s, r) => s + r.pqi, 0) / records.length;
    const passRate = (records.filter(r => r.pqi >= 75).length / records.length) * 100;
    const avgDefects = records.reduce((s, r) => s + r.defectCount, 0) / records.length;

    const summaryData: (string | number)[][] = [
      ['MacFry Batch Summary'],
      [],
      ['Total Samples', records.length],
      ['Avg PQI (%)', avgPqi.toFixed(1)],
      ['Pass Rate (%)', passRate.toFixed(1)],
      ['Avg Defect Count', avgDefects.toFixed(1)],
    ];
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    summaryWs['!cols'] = [{ wch: 20 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');
  }

  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/**
 * Trigger download of McFry Excel file
 */
export function downloadMcFryExcel(records: BatchRecord[], filename?: string) {
  const blob = generateMcFryExcel(records);
  const name = filename ?? `mcfry_batch_${new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')}.xlsx`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}
