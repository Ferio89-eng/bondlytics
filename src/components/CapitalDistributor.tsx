import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import type { PortfolioAnalytics } from '../types/portfolio.ts';
import {
  formatEur,
  formatNumber,
  formatPercent,
} from '../utils/formatters.ts';

interface CapitalDistributorProps {
  analytics: PortfolioAnalytics;
  autoRebalance100: boolean;
  onToggleAutoRebalance: (enabled: boolean) => void;
  onUpdateWeight: (id: string, weightPercent: number) => void;
  onUpdateNominal: (id: string, nominalCcy: number) => void;
  onClearManualNominals: () => void;
}

export function CapitalDistributor({
  analytics,
  autoRebalance100,
  onToggleAutoRebalance,
  onUpdateWeight,
  onUpdateNominal,
  onClearManualNominals,
}: CapitalDistributorProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const { holdings } = analytics;
  const hasManualNominals = holdings.some(
    (h) => typeof h.holding.manualNominalCcy === 'number'
  );

  const totalCostWithComm = analytics.totalInitialOutlayEur;
  const targetCap = analytics.totalCapitalTargetEur;
  const deltaCap = targetCap - totalCostWithComm;

  // Donut SVG geometry (+10% rispetto al formato base)
  const size = 238;
  const center = size / 2;
  const radius = 86;
  const strokeWidth = 29;
  const circumference = 2 * Math.PI * radius;

  const totalForDonut = Math.max(
    1,
    analytics.totalInvestedExclCommEur
  );

  let cumulativeFraction = 0;
  const segments = holdings
    .filter((h) => h.settlementOutlayEur > 0)
    .map((hc) => {
      const fraction = hc.settlementOutlayEur / totalForDonut;
      const dashLength = Math.max(0, fraction * circumference);
      const dashOffset = -cumulativeFraction * circumference;
      cumulativeFraction += fraction;
      return {
        hc,
        dashLength,
        dashOffset,
      };
    });

  const hoveredItem = hoveredId
    ? holdings.find((h) => h.holding.id === hoveredId)
    : null;

  return (
    <section
      id="distribuzione"
      className="scroll-mt-20 bg-white border border-slate-200 rounded-xl p-6 space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Distribuzione Capitale e Simulatore Acquisto
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Modifica le percentuali di allocazione o il nominale da acquistare per calcolare il costo reale dal prezzo del link
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 self-start sm:self-auto">
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRebalance100}
              onChange={(e) => onToggleAutoRebalance(e.target.checked)}
              className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
            />
            <span>Mantieni somma al 100%</span>
          </label>

          {hasManualNominals && (
            <button
              type="button"
              onClick={onClearManualNominals}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Torna a calcolo da %</span>
            </button>
          )}
        </div>
      </div>

      {holdings.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-500">
          Aggiungi almeno uno strumento per configurare la distribuzione del capitale.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left: Interactive Graphical Donut + Budget Bar */}
          <div className="lg:col-span-5 space-y-5">
            <div className="flex justify-center pt-1">
              <div className="relative" style={{ width: size, height: size }}>
                <svg
                  width={size}
                  height={size}
                  viewBox={`0 0 ${size} ${size}`}
                  className="-rotate-90"
                  role="img"
                  aria-label="Grafico interattivo distribuzione capitale"
                >
                  <circle
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke="#f1f5f9"
                    strokeWidth={strokeWidth}
                  />
                  {segments.map(({ hc, dashLength, dashOffset }) => {
                    const isHovered = hoveredId === hc.holding.id;
                    const isDimmed = hoveredId !== null && !isHovered;
                    return (
                      <circle
                        key={hc.holding.id}
                        cx={center}
                        cy={center}
                        r={radius}
                        fill="none"
                        stroke={hc.holding.color}
                        strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                        strokeDasharray={`${Math.max(0, dashLength - 1.5)} ${circumference}`}
                        strokeDashoffset={dashOffset}
                        opacity={isDimmed ? 0.35 : 1}
                        className="transition-all duration-150 cursor-pointer"
                        onMouseEnter={() => setHoveredId(hc.holding.id)}
                        onMouseLeave={() => setHoveredId(null)}
                      />
                    );
                  })}
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pointer-events-none">
                  <span className="text-[11px] font-medium text-slate-500 truncate max-w-[144px]">
                    {hoveredItem
                      ? hoveredItem.holding.bond.isin
                      : 'Costo Acquisto'}
                  </span>
                  <span className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                    {hoveredItem
                      ? formatEur(hoveredItem.totalInitialCostEur, 0)
                      : formatEur(totalCostWithComm, 0)}
                  </span>
                  <span
                    className={`text-[11px] font-mono tabular-nums mt-0.5 ${
                      !hoveredItem && deltaCap < -1
                        ? 'text-rose-700'
                        : 'text-teal-700'
                    }`}
                  >
                    {hoveredItem
                      ? `${formatPercent(hoveredItem.effectiveWeightPercent, 1)} · Nom. ${formatNumber(
                          hoveredItem.nominalAmountCcy,
                          0
                        )}`
                      : deltaCap >= 0
                      ? `Residuo ${formatEur(deltaCap, 0)}`
                      : `Oltre cap. ${formatEur(Math.abs(deltaCap), 0)}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Proportional stacked progress bar */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-600">Impiego sul Capitale Target</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {targetCap > 0
                    ? formatPercent((totalCostWithComm / targetCap) * 100, 1)
                    : '0,0%'}
                </span>
              </div>
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex">
                {holdings.map((hc) => {
                  const pctOfTarget =
                    targetCap > 0
                      ? (hc.totalInitialCostEur / targetCap) * 100
                      : 0;
                  return (
                    <div
                      key={hc.holding.id}
                      style={{
                        width: `${Math.max(0, Math.min(100, pctOfTarget))}%`,
                        backgroundColor: hc.holding.color,
                      }}
                      className="h-full transition-all duration-150"
                      title={`${hc.holding.bond.description}: ${formatEur(
                        hc.totalInitialCostEur
                      )}`}
                    />
                  );
                })}
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 text-xs">
                <div>
                  <div className="text-[11px] text-slate-500">Capitale Target</div>
                  <div className="font-mono tabular-nums font-semibold text-slate-900">
                    {formatEur(targetCap, 0)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Costo Totale</div>
                  <div className="font-mono tabular-nums font-semibold text-slate-900">
                    {formatEur(totalCostWithComm, 0)}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">
                    {deltaCap >= 0 ? 'Residuo' : 'Eccedenza'}
                  </div>
                  <div
                    className={`font-mono tabular-nums font-semibold ${
                      deltaCap >= 0 ? 'text-teal-700' : 'text-rose-700'
                    }`}
                  >
                    {formatEur(Math.abs(deltaCap), 0)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Per-Instrument Sliders + Nominal Steppers + Cost Readout */}
          <div className="lg:col-span-7 divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {holdings.map((hc) => {
              const { holding } = hc;
              const { bond } = holding;
              const minLot = Math.max(1, bond.minLot || 1000);
              const isManual = typeof holding.manualNominalCcy === 'number';
              const isHovered = hoveredId === holding.id;

              return (
                <div
                  key={holding.id}
                  onMouseEnter={() => setHoveredId(holding.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`p-4 space-y-3 transition-colors ${
                    isHovered ? 'bg-slate-50/80' : 'bg-white'
                  }`}
                >
                  {/* Instrument Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: holding.color }}
                      />
                      <span className="text-xs font-semibold text-slate-900 truncate">
                        {bond.description}
                      </span>
                      <span className="text-[11px] font-mono tabular-nums text-slate-400">
                        {bond.isin}
                      </span>
                    </div>

                    <div className="text-[11px] font-mono tabular-nums text-slate-500">
                      Prezzo link: <strong className="text-slate-800">{formatNumber(bond.settlementPrice, 3)}</strong>
                      {' · '}
                      Lotto {formatNumber(minLot, 0)} {bond.currency}
                    </div>
                  </div>

                  {/* Interactive Controls: Weight Slider + Nominal Stepper */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
                    {/* % Distribution Slider & Input */}
                    <div className="sm:col-span-7 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-slate-600">
                        <span>Quota distribuzione (%)</span>
                        <span className="font-mono tabular-nums text-slate-500">
                          Effettiva: {formatPercent(hc.effectiveWeightPercent, 1)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={0.5}
                          value={Math.min(100, Math.max(0, holding.weightPercent))}
                          onChange={(e) =>
                            onUpdateWeight(holding.id, Number(e.target.value))
                          }
                          aria-label={`Percentuale distribuzione ${bond.description}`}
                          className="flex-1 workstation-slider"
                        />
                        <div className="relative w-20 shrink-0">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            value={Number(holding.weightPercent.toFixed(1))}
                            onChange={(e) => {
                              const val = Number.parseFloat(e.target.value);
                              onUpdateWeight(
                                holding.id,
                                Number.isFinite(val)
                                  ? Math.max(0, Math.min(100, val))
                                  : 0
                              );
                            }}
                            aria-label={`Valore percentuale ${bond.description}`}
                            className="w-full pl-2 pr-6 py-1.5 text-right text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] font-mono text-slate-400">
                            %
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Direct Nominal Control */}
                    <div className="sm:col-span-5 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-slate-600">
                        <span>
                          Nominale ({bond.currency})
                          {isManual ? ' · manuale' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateNominal(
                              holding.id,
                              Math.max(0, hc.nominalAmountCcy - minLot)
                            )
                          }
                          title={`Riduci di ${formatNumber(minLot, 0)} ${bond.currency}`}
                          className="p-1.5 text-slate-600 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <input
                          type="number"
                          min={0}
                          step={minLot}
                          value={Math.round(hc.nominalAmountCcy)}
                          onChange={(e) => {
                            const val = Number.parseFloat(e.target.value);
                            onUpdateNominal(
                              holding.id,
                              Number.isFinite(val) ? Math.max(0, val) : 0
                            );
                          }}
                          aria-label={`Nominale da acquistare ${bond.description}`}
                          className="flex-1 min-w-0 px-2.5 py-1.5 text-right text-xs font-mono tabular-nums font-semibold text-slate-900 bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            onUpdateNominal(
                              holding.id,
                              hc.nominalAmountCcy + minLot
                            )
                          }
                          title={`Aumenta di ${formatNumber(minLot, 0)} ${bond.currency}`}
                          className="p-1.5 text-slate-600 bg-slate-50 border border-slate-200 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Associated Purchase Cost Readout */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] font-mono tabular-nums text-slate-500">
                    <div>
                      Corso secco:{' '}
                      <span className="text-slate-800">
                        {formatEur(hc.cleanPrincipalEur)}
                      </span>
                      {' · '}
                      Rateo netto:{' '}
                      <span className="text-slate-800">
                        {formatEur(hc.accruedNetEur)}
                      </span>
                      {' · '}
                      Comm.:{' '}
                      <span className="text-rose-700">
                        {formatEur(hc.commissionEur)}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-slate-900">
                      Costo acquisto:{' '}
                      <span className="text-teal-700">
                        {formatEur(hc.totalInitialCostEur)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
