import React, { useState, useCallback, useRef } from 'react';
import { Activity, Cpu, FileBarChart, Settings, Zap, ChevronRight, AlertCircle, CheckCircle, Eye, Brain, Waves } from 'lucide-react';
import heroImage from '@/assets/hero-banner.jpg';
import { ImageAnalyzer } from '@/components/ImageAnalyzer';
import { HueHistogram } from '@/components/HueHistogram';
import { DefectHeatmap } from '@/components/DefectHeatmap';
import { PQIScoring } from '@/components/PQIScoring';
import { AnalysisMetrics } from '@/components/AnalysisMetrics';
import { BatchReport } from '@/components/BatchReport';
import { CalibrationPanel } from '@/components/CalibrationPanel';
import { TextureAnalysisPanel } from '@/components/TextureAnalysisPanel';
import { AcrylamideRiskPanel } from '@/components/AcrylamideRiskPanel';
import { GradCAMMap } from '@/components/GradCAMMap';
import type { AnalysisResult } from '@/lib/colorAnalysis';
import { getPQIStatus } from '@/lib/colorAnalysis';
import { DEFAULT_CALIBRATION, type CalibrationData } from '@/lib/calibration';
import type { BatchRecord } from '@/lib/pqiEngine';

type Tab = 'analysis' | 'batch' | 'calibration';

function StatusDot({ status }: { status: 'online' | 'processing' | 'idle' }) {
  const colors = { online: '#22c55e', processing: '#f59e0b', idle: '#64748b' };
  return (
    <span className="relative flex h-2 w-2">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
        style={{ backgroundColor: colors[status] }} />
      <span className="relative inline-flex rounded-full h-2 w-2"
        style={{ backgroundColor: colors[status] }} />
    </span>
  );
}

function NavBtn({ active, onClick, icon: Icon, label, badge }: {
  active: boolean; onClick: () => void; icon: React.FC<any>; label: string; badge?: number;
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-display font-semibold tracking-wider transition-all duration-200 relative ${
        active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
      }`}
      style={active ? { background: 'var(--gradient-gold)', boxShadow: '0 0 16px hsl(42 95% 52% / 0.35)' } : {}}>
      <Icon className="w-4 h-4" />
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full font-mono-custom"
          style={{ background: 'hsl(42 95% 52% / 0.25)', color: 'hsl(42 95% 65%)' }}>
          {badge}
        </span>
      )}
    </button>
  );
}

export default function Index() {
  const [activeTab, setActiveTab] = useState<Tab>('analysis');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [calibration, setCalibration] = useState<CalibrationData>(DEFAULT_CALIBRATION);
  const [batchRecords, setBatchRecords] = useState<BatchRecord[]>([]);
  const [currentImageSrc, setCurrentImageSrc] = useState<string | null>(null);
  const imageNameRef = useRef('sample');

  const handleAnalysisComplete = useCallback((res: AnalysisResult, imageData: ImageData, imageSrc: string) => {
    setResult(res);
    setCurrentImageSrc(imageSrc);

    const status = getPQIStatus(res.pqi);
    const record: BatchRecord = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      batchId: `B${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`,
      imageName: imageNameRef.current,
      medianHue: res.pixelStats.medianHue,
      pqi: res.pqi,
      defectCount: res.defectCount,
      processColorScore: res.processColorScore,
      hueScore: res.hueScore,
      mottlingScore: res.mottlingScore,
      defectScore: res.defectScore,
      agtronScore: res.pixelStats.agtronScore,
      usdaLabel: res.usdaScoreLabel,
      status: status.label,
    };
    setBatchRecords(prev => [record, ...prev]);
  }, []);

  const pqiStatus = result ? getPQIStatus(result.pqi) : null;

  return (
    <div className="flex flex-col min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      {/* Top header bar */}
      <header className="sticky top-0 z-50 border-b" style={{ borderColor: 'hsl(var(--panel-border))', background: 'hsl(220 20% 6% / 0.95)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center h-14 px-4 gap-4">
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="w-8 h-8 rounded flex items-center justify-center font-display text-sm font-bold"
              style={{ background: 'var(--gradient-gold)', color: 'hsl(220 20% 7%)' }}>Mc</div>
            <div className="hidden sm:block">
              <div className="font-display text-base font-bold text-foreground leading-none">MacFry</div>
              <div className="text-xs text-muted-foreground leading-none">Deep-Sensory Vision V2™</div>
            </div>
          </div>

          <div className="hidden md:block h-6 w-px" style={{ background: 'hsl(var(--border))' }} />

          <nav className="flex items-center gap-1">
            <NavBtn active={activeTab === 'analysis'} onClick={() => setActiveTab('analysis')} icon={Eye} label="ANALYSIS" />
            <NavBtn active={activeTab === 'batch'} onClick={() => setActiveTab('batch')} icon={FileBarChart} label="BATCH" badge={batchRecords.length} />
            <NavBtn active={activeTab === 'calibration'} onClick={() => setActiveTab('calibration')} icon={Settings} label="CALIBRATION" />
          </nav>

          <div className="flex-1" />

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="hidden sm:flex items-center gap-1.5">
              <StatusDot status={isAnalyzing ? 'processing' : result ? 'online' : 'idle'} />
              <span>{isAnalyzing ? 'PROCESSING' : result ? 'READY' : 'STANDBY'}</span>
            </div>

            {result && pqiStatus && (
              <div className="flex items-center gap-2 px-3 py-1 rounded"
                style={{ background: pqiStatus.color + '22', border: `1px solid ${pqiStatus.color}44` }}>
                <span className="font-mono-custom font-bold" style={{ color: pqiStatus.color }}>
                  PQI: {result.pqi}%
                </span>
                <span className="font-display text-xs font-semibold" style={{ color: pqiStatus.color }}>
                  {pqiStatus.label}
                </span>
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5" style={{ color: 'hsl(280 70% 60%)' }} />
              <span style={{ color: 'hsl(280 70% 65%)' }} className="font-mono-custom">V2 ENGINE</span>
            </div>
          </div>
        </div>

        {result && (result.processColorScore <= 2 || result.processColorScore >= 8 || result.defectScore >= 8) && (
          <div className="px-4 py-1.5 flex items-center gap-2 text-xs"
            style={{ background: 'hsl(0 75% 55% / 0.15)', borderTop: '1px solid hsl(0 75% 55% / 0.3)' }}>
            <AlertCircle className="w-3.5 h-3.5 text-destructive" />
            <span className="text-destructive font-display font-semibold">QUALITY ALERT</span>
            <ChevronRight className="w-3 h-3 text-destructive" />
            <span style={{ color: 'hsl(0 75% 65%)' }}>Score 2/8 or 1/9 detected. Fuzzy PQI penalty applied. Review sample immediately.</span>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="flex-1 px-4 py-4 max-w-[1600px] mx-auto w-full">

        {activeTab === 'analysis' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

            {/* Left column: Image + Metrics */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              {!result && !isAnalyzing && (
                <div className="relative rounded-xl overflow-hidden border" style={{ borderColor: 'hsl(var(--panel-border))' }}>
                  <img src={heroImage} alt="McCain fry quality control" className="w-full h-44 object-cover" />
                  <div className="absolute inset-0 flex flex-col justify-end p-4"
                    style={{ background: 'linear-gradient(to top, hsl(220 20% 7% / 0.95), transparent)' }}>
                    <div className="font-display text-lg font-bold text-foreground">Deep-Sensory Vision V2™</div>
                    <div className="text-xs text-muted-foreground">Shadow-Aware · CIE ΔE₀₀ · FFT Texture · Fuzzy PQI</div>
                    <div className="flex gap-2 mt-2 text-xs flex-wrap">
                      {['CIE DE2000', 'Shadow Filter', 'FFT Crispness', 'Fuzzy Logic', 'Acrylamide'].map(tag => (
                        <span key={tag} className="px-2 py-0.5 rounded"
                          style={{ background: 'hsl(280 70% 55% / 0.15)', color: 'hsl(280 70% 70%)', border: '1px solid hsl(280 70% 55% / 0.3)' }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div className="industrial-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Activity className="w-4 h-4 text-gold" />
                  <h2 className="font-display text-sm font-semibold tracking-wider">IMAGE INPUT</h2>
                  <span className="ml-auto text-xs font-mono-custom text-muted-foreground">PPM: {calibration.ppm.toFixed(2)}</span>
                </div>
                <ImageAnalyzer onAnalysisComplete={handleAnalysisComplete} calibration={calibration}
                  isAnalyzing={isAnalyzing} setIsAnalyzing={setIsAnalyzing} />
              </div>

              {result && (
                <div className="industrial-card p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-4 h-4 text-gold" />
                    <h2 className="font-display text-sm font-semibold tracking-wider">PIXEL METRICS</h2>
                  </div>
                  <AnalysisMetrics result={result} />
                </div>
              )}
            </div>

            {/* Middle column: PQI + Hue + Texture */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              {result ? (
                <>
                  <div className="industrial-card p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Brain className="w-4 h-4" style={{ color: 'hsl(280 70% 60%)' }} />
                      <h2 className="font-display text-sm font-semibold tracking-wider">FUZZY PQI SCORING</h2>
                      <span className="ml-auto text-xs text-muted-foreground">Non-Linear Engine</span>
                    </div>
                    <PQIScoring result={result} />
                  </div>

                  <div className="industrial-card p-4">
                    <HueHistogram result={result} />
                  </div>

                  {/* Texture FFT Analysis */}
                  <div className="industrial-card p-4">
                    <TextureAnalysisPanel texture={result.textureAnalysis} />
                  </div>
                </>
              ) : (
                <div className="industrial-card p-8 flex flex-col items-center justify-center text-center gap-4 min-h-[300px]">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center"
                    style={{ background: 'hsl(280 70% 55% / 0.1)', border: '1px dashed hsl(280 70% 55% / 0.3)' }}>
                    <Brain className="w-8 h-8 opacity-50" style={{ color: 'hsl(280 70% 60%)' }} />
                  </div>
                  <div>
                    <p className="font-display text-base font-semibold text-muted-foreground">DEEP-SENSORY V2 READY</p>
                    <p className="text-xs text-muted-foreground mt-1">Upload a fry sample to activate full analysis pipeline</p>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1 mt-2 text-left w-full max-w-xs">
                    {[
                      'White Balance → Shadow-invariant normalization',
                      'CIE ΔE₀₀ → Perceptual color comparison',
                      'Shadow Classifier → Artifact elimination',
                      'FFT Spectral → Crispness scoring',
                      'Fuzzy PQI → Non-linear quality index',
                      'Maillard → Acrylamide risk estimation',
                      'Grad-CAM → Explainable attribution map',
                    ].map((step, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <CheckCircle className="w-3 h-3 text-gold flex-shrink-0" />
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right column: Heatmap + Grad-CAM + Acrylamide */}
            <div className="lg:col-span-4 flex flex-col gap-4">
              {result ? (
                <>
                  <div className="industrial-card p-4">
                    <DefectHeatmap result={result} />
                  </div>

                  {/* Grad-CAM Attribution Map */}
                  {result.gradCAMData && (
                    <div className="industrial-card p-4">
                      <GradCAMMap gradCAMData={result.gradCAMData} reasoning={result.fuzzyPQI?.reasoning || []} />
                    </div>
                  )}

                  {/* Acrylamide Risk */}
                  {result.acrylamideRisk && (
                    <div className="industrial-card p-4">
                      <AcrylamideRiskPanel risk={result.acrylamideRisk} deltaE={result.meanDeltaE} />
                    </div>
                  )}

                  {/* Defect list */}
                  {result.defects.length > 0 && (
                    <div className="industrial-card p-4">
                      <h3 className="font-display text-sm font-semibold tracking-wider mb-3">
                        DEFECT CATALOG
                        <span className="ml-2 text-xs font-mono-custom text-muted-foreground">
                          ({result.shadowCount} shadows filtered)
                        </span>
                      </h3>
                      <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto">
                        {result.defects.slice(0, 20).map((defect, i) => {
                          const typeColors: Record<string, string> = {
                            burnt: '#ff2222', dark: '#ff6600', light: '#22aaff',
                            mottled: '#ffcc00', sugar_end: '#ff88ff', disease: '#cc44ff',
                          };
                          const color = typeColors[defect.type] || '#ffffff';
                          return (
                            <div key={i} className="flex items-center gap-2 text-xs rounded px-2 py-1.5"
                              style={{ background: color + '11', border: `1px solid ${color}33` }}>
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
                              <span className="font-display font-semibold" style={{ color }}>
                                {defect.type.replace('_', ' ').toUpperCase()}
                              </span>
                              {defect.contourPosition && (
                                <span className="text-muted-foreground text-xs">({defect.contourPosition})</span>
                              )}
                              <span className="text-muted-foreground ml-auto">
                                {defect.areamm2?.toFixed(0) ?? defect.area.toFixed(0)}mm²
                              </span>
                              {defect.deltaE !== undefined && (
                                <span className="font-mono-custom text-muted-foreground">ΔE:{defect.deltaE.toFixed(0)}</span>
                              )}
                              <span className="font-mono-custom" style={{ color }}>
                                {(defect.severity * 100).toFixed(0)}%
                              </span>
                            </div>
                          );
                        })}
                        {result.defects.length > 20 && (
                          <p className="text-xs text-center text-muted-foreground py-1">
                            +{result.defects.length - 20} more defects
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* USDA Color Reference */}
                  <div className="industrial-card p-4">
                    <h3 className="font-display text-xs font-semibold tracking-wider mb-2 text-muted-foreground">USDA COLOR SCALE</h3>
                    <div className="flex flex-col gap-1">
                      {[
                        { val: '0.0', label: 'Very Dark', bg: 'hsl(20 70% 20%)' },
                        { val: '0.25', label: 'Dark', bg: 'hsl(28 70% 35%)' },
                        { val: '0.5 ★', label: 'TARGET', bg: 'hsl(35 75% 52%)' },
                        { val: '0.75', label: 'Light', bg: 'hsl(42 60% 68%)' },
                        { val: '1.0', label: 'Very Light', bg: 'hsl(50 50% 80%)' },
                      ].map(row => {
                        const isTarget = row.val.includes('★');
                        const isCurrent = Math.abs(result.usdaColorScore - parseFloat(row.val)) < 0.15;
                        return (
                          <div key={row.val} className="flex items-center gap-2 rounded px-2 py-1 transition-all"
                            style={{
                              border: isCurrent ? '1px solid hsl(42 95% 52% / 0.8)' : '1px solid transparent',
                              background: isCurrent ? 'hsl(42 95% 52% / 0.1)' : 'transparent',
                            }}>
                            <div className="w-8 h-4 rounded-sm flex-shrink-0" style={{ background: row.bg }} />
                            <span className="font-mono-custom text-xs" style={{ color: isTarget ? 'hsl(42 95% 65%)' : 'hsl(215 12% 50%)' }}>
                              {row.val}
                            </span>
                            <span className="text-xs text-muted-foreground">{row.label}</span>
                            {isCurrent && <span className="ml-auto text-xs text-gold font-mono-custom">◄</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : (
                <div className="industrial-card p-6 min-h-[200px] flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-xs text-muted-foreground mb-2">DEFECT HEATMAP + GRAD-CAM</div>
                    <div className="text-xs text-muted-foreground opacity-50">Shadow-aware heatmap<br />renders post-analysis</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'batch' && (
          <div className="industrial-card p-6">
            <BatchReport records={batchRecords} onClear={() => setBatchRecords([])} />
          </div>
        )}

        {activeTab === 'calibration' && (
          <div className="max-w-lg">
            <div className="industrial-card p-6">
              <CalibrationPanel calibration={calibration} onCalibrationChange={setCalibration} />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t px-4 py-3 flex items-center justify-between text-xs text-muted-foreground"
        style={{ borderColor: 'hsl(var(--panel-border))', background: 'hsl(220 20% 6%)' }}>
        <div className="flex items-center gap-3">
          <span className="font-display font-semibold text-gold">MacFry Deep-Sensory V2™</span>
          <span>v2.0 Industrial</span>
        </div>
        <div className="flex items-center gap-3">
          <span>CIE ΔE₀₀</span>
          <span>•</span>
          <span>FFT Texture</span>
          <span>•</span>
          <span>Fuzzy Logic PQI</span>
          <span>•</span>
          <span>Grad-CAM</span>
        </div>
        <div className="text-gold font-mono-custom">© McCain Foods Confidential</div>
      </footer>
    </div>
  );
}
