import { ExternalLink, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { HoldingCalculation, PortfolioAnalytics } from '../types/portfolio.ts';
import {
  extractIssuerName,
  formatCurrency,
  formatEur,
  formatNumber,
  formatPercent,
  PORTFOLIO_PALETTE,
} from '../utils/formatters.ts';

interface CompositionChartsProps {
  analytics: PortfolioAnalytics;
}

interface IssuerGroup {
  issuer: string;
  color: string;
  totalEur: number;
  weightPercent: number;
  instrumentCount: number;
  isinList: string[];
  items: HoldingCalculation[];
}

const TAX_COLORS = ['#059669', '#D97706', '#0284C7', '#64748B'];

export function CompositionCharts({ analytics }: CompositionChartsProps) {
  const [hoveredIssuer, setHoveredIssuer] = useState<string | null>(null);
  const [selectedIssuer, setSelectedIssuer] = useState<string | null>(null);

  const activeHoldings = analytics.holdings.filter(
    (h) => h.settlementOutlayEur > 0
  );
  const totalInvested = analytics.totalInvestedExclCommEur;

  const issuerGroups = useMemo<IssuerGroup[]>(() => {
    const map = new Map<string, HoldingCalculation[]>();

    for (const hc of activeHoldings) {
      const issuer = extractIssuerName(
        hc.holding.bond.description,
        hc.holding.bond.isin
      );
      const list = map.get(issuer);
      if (list) {
        list.push(hc);
      } else {
        map.set(issuer, [hc]);
      }
    }

    return Array.from(map.entries())
      .map(([issuer, items], idx) => {
        const totalEur = items.reduce((s, x) => s + x.settlementOutlayEur, 0);
        return {
          issuer,
          color: PORTFOLIO_PALETTE[idx % PORTFOLIO_PALETTE.length],
          totalEur,
          weightPercent:
            totalInvested > 0 ? (totalEur / totalInvested) * 100 : 0,
          instrumentCount: items.length,
          isinList: items.map((x) => x.holding.bond.isin),
          items,
        };
      })
      .sort((a, b) => b.totalEur - a.totalEur);
  }, [activeHoldings, totalInvested]);

  const selectedGroup = useMemo(
    () => issuerGroups.find((g) => g.issuer === selectedIssuer) ?? null,
    [issuerGroups, selectedIssuer]
  );

  useEffect(() => {
    if (!selectedGroup) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setSelectedIssuer(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedGroup]);

  // SVG Donut geometry
  const size = 216;
  const center = size / 2;
  const radius = 78;
  const strokeWidth = 26;
  const circumference = 2 * Math.PI * radius;

  let cumulativeFraction = 0;
  const segments = issuerGroups.map((group) => {
    const fraction = totalInvested > 0 ? group.totalEur / totalInvested : 0;
    const dashLength = Math.max(0, fraction * circumference);
    const dashOffset = -cumulativeFraction * circumference;
    cumulativeFraction += fraction;
    return {
      group,
      fraction,
      dashLength,
      dashOffset,
    };
  });

  const hoveredGroup = hoveredIssuer
    ? issuerGroups.find((g) => g.issuer === hoveredIssuer)
    : null;

  const { maturityBuckets, taxRatesBreakdown } = analytics;

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Donut Allocation Card Grouped by Issuer */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6">
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Ripartizione Capitale Investito
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Clicca su un emittente per visualizzare il dettaglio dei titoli inclusi
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {issuerGroups.length}{' '}
              {issuerGroups.length === 1 ? 'emittente' : 'emittenti'} ·{' '}
              {activeHoldings.length}{' '}
              {activeHoldings.length === 1 ? 'strumento' : 'strumenti'}
            </span>
          </div>

          {issuerGroups.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Nessun capitale allocato. Inserisci almeno un titolo con peso superiore a 0%.
            </div>
          ) : (
            <div className="pt-5 grid grid-cols-1 sm:grid-cols-12 gap-6 items-center">
              <div className="sm:col-span-5 flex justify-center">
                <div className="relative" style={{ width: size, height: size }}>
                  <svg
                    width={size}
                    height={size}
                    viewBox={`0 0 ${size} ${size}`}
                    className="-rotate-90"
                    role="img"
                    aria-label="Grafico composizione portafoglio per emittente"
                  >
                    <circle
                      cx={center}
                      cy={center}
                      r={radius}
                      fill="none"
                      stroke="#f1f5f9"
                      strokeWidth={strokeWidth}
                    />
                    {segments.map(({ group, dashLength, dashOffset }) => {
                      const isHovered = hoveredIssuer === group.issuer;
                      const isDimmed = hoveredIssuer !== null && !isHovered;
                      return (
                        <circle
                          key={group.issuer}
                          cx={center}
                          cy={center}
                          r={radius}
                          fill="none"
                          stroke={group.color}
                          strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                          strokeDasharray={`${Math.max(0, dashLength - 1.5)} ${circumference}`}
                          strokeDashoffset={dashOffset}
                          opacity={isDimmed ? 0.35 : 1}
                          className="transition-all duration-150 cursor-pointer"
                          onMouseEnter={() => setHoveredIssuer(group.issuer)}
                          onMouseLeave={() => setHoveredIssuer(null)}
                          onClick={() => setSelectedIssuer(group.issuer)}
                        />
                      );
                    })}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 pointer-events-none">
                    <span className="text-[11px] font-medium text-slate-500 truncate max-w-[130px]">
                      {hoveredGroup ? hoveredGroup.issuer : 'Investito Netto'}
                    </span>
                    <span className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                      {hoveredGroup
                        ? formatEur(hoveredGroup.totalEur, 0)
                        : formatEur(totalInvested, 0)}
                    </span>
                    <span className="text-[11px] font-mono tabular-nums text-teal-700 mt-0.5">
                      {hoveredGroup
                        ? formatPercent(hoveredGroup.weightPercent, 1)
                        : analytics.uninvestedCashEur > 1
                        ? `Residuo ${formatEur(analytics.uninvestedCashEur, 0)}`
                        : '100,0% allocato'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="sm:col-span-7 space-y-2.5">
                {issuerGroups.map((group) => {
                  const isHovered = hoveredIssuer === group.issuer;
                  return (
                    <button
                      key={group.issuer}
                      type="button"
                      onMouseEnter={() => setHoveredIssuer(group.issuer)}
                      onMouseLeave={() => setHoveredIssuer(null)}
                      onClick={() => setSelectedIssuer(group.issuer)}
                      className={`w-full text-left flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg border transition-colors cursor-pointer ${
                        isHovered
                          ? 'bg-slate-50 border-slate-300'
                          : 'bg-white border-slate-100 hover:border-slate-300 hover:bg-slate-50/70'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: group.color }}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 truncate">
                            {group.issuer}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono tabular-nums truncate">
                            {group.instrumentCount}{' '}
                            {group.instrumentCount === 1 ? 'titolo' : 'titoli'} ·{' '}
                            {group.isinList.join(', ')}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xs font-semibold font-mono tabular-nums text-slate-900">
                          {formatPercent(group.weightPercent, 1)}
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-500">
                          {formatEur(group.totalEur, 0)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Maturity Ladder & Tax Regime Card */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Struttura per Scadenza e Fiscalità
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Esposizione temporale e aliquote estratte dalle schede titolo
            </p>
          </div>

          {/* Maturity Buckets */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-slate-700">
              Orizzonte Scadenze (Duration Media Netta:{' '}
              <span className="font-mono tabular-nums text-slate-900">
                {analytics.weightedNetDuration.toFixed(2).replace('.', ',')} anni
              </span>
              )
            </div>
            <div className="space-y-2.5">
              {maturityBuckets.map((bucket) => (
                <div key={bucket.label} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">{bucket.label}</span>
                    <span className="font-mono tabular-nums text-slate-900 font-medium">
                      {formatEur(bucket.amountEur, 0)} ({formatPercent(bucket.percent, 1)})
                    </span>
                  </div>
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-700 rounded-full transition-all duration-200"
                      style={{ width: `${Math.min(100, bucket.percent)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5 space-y-3">
            <div className="text-xs font-semibold text-slate-700">
              Tassazione Applicata (da SimpleToolsForInvestors)
            </div>
            <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
              {taxRatesBreakdown.map((item, idx) => (
                <div
                  key={item.rate}
                  className="h-full"
                  style={{
                    width: `${item.percent}%`,
                    backgroundColor: TAX_COLORS[idx % TAX_COLORS.length],
                  }}
                  title={`Aliquota ${formatNumber(item.rate, 2)}%`}
                />
              ))}
            </div>
            {taxRatesBreakdown.length === 0 ? (
              <div className="text-xs text-slate-500">
                Nessun dato fiscale disponibile.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs pt-1">
                {taxRatesBreakdown.map((item, idx) => (
                  <div
                    key={item.rate}
                    className="flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-sm shrink-0"
                        style={{
                          backgroundColor: TAX_COLORS[idx % TAX_COLORS.length],
                        }}
                      />
                      <span className="text-slate-600">
                        Aliquota {formatNumber(item.rate, 1)}%
                      </span>
                    </div>
                    <span className="font-mono tabular-nums font-medium text-slate-900">
                      {formatPercent(item.percent, 1)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Issuer Detail Modal ("Maschera") */}
      {selectedGroup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-[2px]"
          onClick={() => setSelectedIssuer(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="issuer-modal-title"
        >
          <div
            className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-5xl max-h-[88vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: selectedGroup.color }}
                />
                <div className="min-w-0">
                  <h4
                    id="issuer-modal-title"
                    className="text-base font-bold text-slate-900 truncate"
                  >
                    Dettaglio Emittente: {selectedGroup.issuer}
                  </h4>
                  <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                    {selectedGroup.instrumentCount}{' '}
                    {selectedGroup.instrumentCount === 1 ? 'titolo' : 'titoli'} ·
                    Controvalore {formatEur(selectedGroup.totalEur)} · Peso
                    effettivo {formatPercent(selectedGroup.weightPercent, 1)}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedIssuer(null)}
                aria-label="Chiudi maschera dettaglio emittente"
                className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Table matching Strumenti in Portafoglio */}
            <div className="p-6 overflow-auto">
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                      <th className="py-2.5 px-3 min-w-[230px]">Titolo & ISIN</th>
                      <th className="py-2.5 px-3">Data Acquisto</th>
                      <th className="py-2.5 px-3 text-right">Prezzo</th>
                      <th className="py-2.5 px-3 text-right">Peso %</th>
                      <th className="py-2.5 px-3 text-right">Nominale</th>
                      <th className="py-2.5 px-3 text-right">Controvalore</th>
                      <th className="py-2.5 px-3 text-right">Comm.</th>
                      <th className="py-2.5 px-3 text-right">Rend. Lordo / Netto</th>
                      <th className="py-2.5 px-3 text-right">Cedola / Anno (Netta)</th>
                      <th className="py-2.5 px-3 text-right">Scheda</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {selectedGroup.items.map((hc) => {
                      const { holding, effectivePurchaseIsoDate } = hc;
                      const { bond } = holding;
                      const [py, pm, pd] = effectivePurchaseIsoDate.split('-');
                      const displayPurchaseDate =
                        py && pm && pd ? `${pd}/${pm}/${py}` : bond.settlementDate;
                      return (
                        <tr
                          key={holding.id}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          <td className="py-2.5 px-3">
                            <div className="flex items-start gap-2.5">
                              <span
                                className="w-2.5 h-2.5 rounded-sm mt-1 shrink-0"
                                style={{ backgroundColor: holding.color }}
                              />
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-900 truncate max-w-[260px]">
                                  {bond.description}
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                                  {bond.isin} · {bond.marketCode} · Tax{' '}
                                  {formatNumber(bond.taxRate, 1)}% · Lotto{' '}
                                  {formatNumber(bond.minLot, 0)} {bond.currency}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-2.5 px-3 font-mono tabular-nums text-slate-700 whitespace-nowrap">
                            {displayPurchaseDate}
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                            {formatNumber(bond.settlementPrice, 3)}
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            <div className="text-slate-900 font-medium">
                              {formatPercent(holding.weightPercent, 1)}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              eff. {formatPercent(hc.effectiveWeightPercent, 1)}
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 font-medium whitespace-nowrap">
                            {formatCurrency(hc.nominalAmountCcy, bond.currency, 0)}
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900 font-semibold whitespace-nowrap">
                            {formatEur(hc.settlementOutlayEur)}
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-rose-700 whitespace-nowrap">
                            {hc.commissionEur > 0
                              ? formatEur(hc.commissionEur)
                              : '€ 0,00'}
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            <span className="text-slate-600">
                              {formatPercent(bond.grossYield)}
                            </span>
                            <span className="text-slate-300 mx-1">/</span>
                            <span className="font-semibold text-teal-700">
                              {formatPercent(bond.netYield)}
                            </span>
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-teal-700 font-semibold whitespace-nowrap">
                            {formatEur(hc.annualNetCouponEur)}
                          </td>

                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <a
                              href={bond.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Apri scheda su SimpleToolsForInvestors"
                              className="inline-flex p-1.5 text-slate-500 hover:text-teal-700 hover:bg-teal-50 rounded-md transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-50 border-t border-slate-200 text-xs font-semibold font-mono tabular-nums">
                      <td className="py-2.5 px-3 font-sans text-slate-700">
                        Totale {selectedGroup.issuer} ({selectedGroup.instrumentCount}{' '}
                        {selectedGroup.instrumentCount === 1 ? 'titolo' : 'titoli'})
                      </td>
                      <td className="py-2.5 px-3" />
                      <td className="py-2.5 px-3" />
                      <td className="py-2.5 px-3 text-right text-slate-900">
                        {formatPercent(selectedGroup.weightPercent, 1)}
                      </td>
                      <td className="py-2.5 px-3" />
                      <td className="py-2.5 px-3 text-right text-slate-900">
                        {formatEur(selectedGroup.totalEur)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-rose-700">
                        {formatEur(
                          selectedGroup.items.reduce(
                            (s, i) => s + i.commissionEur,
                            0
                          )
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <span className="text-slate-600">
                          {formatPercent(
                            selectedGroup.totalEur > 0
                              ? selectedGroup.items.reduce(
                                  (s, i) =>
                                    s +
                                    i.holding.bond.grossYield *
                                      i.settlementOutlayEur,
                                  0
                                ) / selectedGroup.totalEur
                              : 0
                          )}
                        </span>
                        <span className="text-slate-300 mx-1">/</span>
                        <span className="text-teal-700">
                          {formatPercent(
                            selectedGroup.totalEur > 0
                              ? selectedGroup.items.reduce(
                                  (s, i) =>
                                    s +
                                    i.holding.bond.netYield *
                                      i.settlementOutlayEur,
                                  0
                                ) / selectedGroup.totalEur
                              : 0
                          )}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-teal-700">
                        {formatEur(
                          selectedGroup.items.reduce(
                            (s, i) => s + i.annualNetCouponEur,
                            0
                          )
                        )}
                      </td>
                      <td className="py-2.5 px-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
