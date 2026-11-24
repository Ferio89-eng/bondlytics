import { useState } from 'react';
import type { PortfolioAnalytics } from '../types/portfolio.ts';
import { formatEur } from '../utils/formatters.ts';

interface CouponChartsProps {
  analytics: PortfolioAnalytics;
}

type CouponViewMode = 'monthly' | 'annual' | 'annual_table';

export function CouponCharts({ analytics }: CouponChartsProps) {
  const [viewMode, setViewMode] = useState<CouponViewMode>('monthly');
  const [hoveredMonth, setHoveredMonth] = useState<number | null>(null);
  const [hoveredYear, setHoveredYear] = useState<number | null>(null);

  const { monthlySeasonality, annualSchedule } = analytics;

  const maxMonthlyGross = Math.max(
    1,
    ...monthlySeasonality.map((m) => m.next12MonthsGrossEur)
  );
  const avgMonthlyNet =
    monthlySeasonality.reduce((s, m) => s + m.next12MonthsNetEur, 0) / 12;

  const maxAnnualBar = Math.max(
    1,
    ...annualSchedule.map(
      (a) => a.netCouponsEur + a.principalRepaidEur
    )
  );

  const hoveredMonthRow =
    hoveredMonth !== null
      ? monthlySeasonality.find((m) => m.monthIndex === hoveredMonth)
      : null;

  const hoveredYearRow =
    hoveredYear !== null
      ? annualSchedule.find((y) => y.year === hoveredYear)
      : null;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Piano Cedolare Complessivo del Portafoglio
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Distribuzione mensile nei prossimi 12 mesi e proiezione annuale fino a scadenza
          </p>
        </div>

        {/* Segmented control (interactive buttons) */}
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setViewMode('monthly')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              viewMode === 'monthly'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Mensile (12 Mesi)
          </button>
          <button
            type="button"
            onClick={() => setViewMode('annual')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              viewMode === 'annual'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Flussi Annuali
          </button>
          <button
            type="button"
            onClick={() => setViewMode('annual_table')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              viewMode === 'annual_table'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tabella Annuale
          </button>
        </div>
      </div>

      {viewMode === 'monthly' && (
        <div className="space-y-4">
          {/* Summary readout strip */}
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-slate-600">
                Media mensile netta:{' '}
                <strong className="font-mono tabular-nums text-slate-900">
                  {formatEur(avgMonthlyNet)}
                </strong>
              </span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="text-slate-600">
                Totale cedole 12 mesi (netto):{' '}
                <strong className="font-mono tabular-nums text-teal-700">
                  {formatEur(
                    monthlySeasonality.reduce(
                      (s, m) => s + m.next12MonthsNetEur,
                      0
                    )
                  )}
                </strong>
              </span>
            </div>
            <div className="font-mono tabular-nums text-slate-700">
              {hoveredMonthRow
                ? `${hoveredMonthRow.monthLabel}: Netto ${formatEur(
                    hoveredMonthRow.next12MonthsNetEur
                  )} / Lordo ${formatEur(hoveredMonthRow.next12MonthsGrossEur)}`
                : 'Passa sul mese per il dettaglio'}
            </div>
          </div>

          {/* 12-Month Bar Chart */}
          <div className="relative pt-4 pb-2">
            <div className="grid grid-cols-12 gap-2 sm:gap-3 items-end h-56 border-b border-slate-200 pb-2 relative">
              {/* Average dashed line */}
              {avgMonthlyNet > 0 && (
                <div
                  className="absolute left-0 right-0 border-t border-dashed border-amber-500/80 pointer-events-none z-10"
                  style={{
                    bottom: `${Math.min(
                      96,
                      Math.max(4, (avgMonthlyNet / maxMonthlyGross) * 100)
                    )}%`,
                  }}
                >
                  <span className="absolute right-0 -top-4 text-[10px] font-mono tabular-nums text-amber-700 bg-white/90 px-1">
                    Media {formatEur(avgMonthlyNet, 0)}
                  </span>
                </div>
              )}

              {monthlySeasonality.map((m) => {
                const grossH = (m.next12MonthsGrossEur / maxMonthlyGross) * 100;
                const netH = (m.next12MonthsNetEur / maxMonthlyGross) * 100;
                const isHovered = hoveredMonth === m.monthIndex;

                return (
                  <div
                    key={m.monthIndex}
                    onMouseEnter={() => setHoveredMonth(m.monthIndex)}
                    onMouseLeave={() => setHoveredMonth(null)}
                    className="flex flex-col items-center justify-end h-full group cursor-pointer"
                  >
                    <div className="w-full max-w-[38px] h-full flex items-end justify-center relative">
                      {m.next12MonthsGrossEur > 0 ? (
                        <div className="w-full flex flex-col justify-end h-full">
                          <div
                            className={`w-full rounded-t-md relative transition-all duration-150 ${
                              isHovered ? 'bg-slate-300' : 'bg-slate-200'
                            }`}
                            style={{ height: `${Math.max(4, grossH)}%` }}
                          >
                            <div
                              className={`absolute bottom-0 left-0 right-0 rounded-t-md transition-colors duration-150 ${
                                isHovered ? 'bg-teal-600' : 'bg-teal-700'
                              }`}
                              style={{
                                height: `${
                                  grossH > 0 ? (netH / grossH) * 100 : 0
                                }%`,
                              }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-1 bg-slate-100 rounded-full" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* X-Axis Labels + Values */}
            <div className="grid grid-cols-12 gap-2 sm:gap-3 pt-2">
              {monthlySeasonality.map((m) => (
                <div key={m.monthIndex} className="text-center">
                  <div className="text-[11px] font-medium text-slate-600">
                    {m.monthLabel}
                  </div>
                  <div className="text-[10px] font-mono tabular-nums text-slate-500 mt-0.5 truncate">
                    {m.next12MonthsNetEur > 0
                      ? formatEur(m.next12MonthsNetEur, 0)
                      : '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-5 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm bg-teal-700 inline-block" />
              <span>Cedole Nette incassate</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm bg-slate-200 inline-block" />
              <span>Imposta sostitutiva trattenuta</span>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'annual' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 text-xs bg-slate-50 border border-slate-100 rounded-lg px-4 py-2.5">
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-slate-600">
                Orizzonte:{' '}
                <strong className="font-mono tabular-nums text-slate-900">
                  {annualSchedule.length > 0
                    ? `${annualSchedule[0].year}–${
                        annualSchedule[annualSchedule.length - 1].year
                      }`
                    : '—'}
                </strong>
              </span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="text-slate-600">
                Cedole Nette Totali:{' '}
                <strong className="font-mono tabular-nums text-teal-700">
                  {formatEur(analytics.totalNetCouponsEur)}
                </strong>
              </span>
            </div>
            <div className="font-mono tabular-nums text-slate-700">
              {hoveredYearRow
                ? `${hoveredYearRow.year}: Cedole Nette ${formatEur(
                    hoveredYearRow.netCouponsEur
                  )} · Rimborso ${formatEur(
                    hoveredYearRow.principalRepaidEur
                  )} · Saldo Cum. ${formatEur(
                    hoveredYearRow.cumulativeNetFlowEur
                  )}`
                : 'Passa su un anno per i dettagli'}
            </div>
          </div>

          <div className="overflow-x-auto pb-2">
            <div
              className="flex items-end gap-2 h-60 border-b border-slate-200 pb-2 min-w-[600px]"
              style={{
                gridTemplateColumns: `repeat(${Math.max(
                  1,
                  annualSchedule.length
                )}, minmax(0, 1fr))`,
              }}
            >
              {annualSchedule.map((row) => {
                const couponH = (row.netCouponsEur / maxAnnualBar) * 100;
                const principalH = (row.principalRepaidEur / maxAnnualBar) * 100;
                const isHovered = hoveredYear === row.year;
                return (
                  <div
                    key={row.year}
                    onMouseEnter={() => setHoveredYear(row.year)}
                    onMouseLeave={() => setHoveredYear(null)}
                    className="flex-1 flex flex-col items-center justify-end h-full min-w-[26px] cursor-pointer"
                  >
                    <div className="w-full max-w-[34px] h-full flex flex-col justify-end">
                      {row.principalRepaidEur > 0 && (
                        <div
                          className={`w-full rounded-t-sm transition-colors ${
                            isHovered ? 'bg-sky-500' : 'bg-sky-600'
                          }`}
                          style={{ height: `${Math.max(2, principalH)}%` }}
                        />
                      )}
                      {row.netCouponsEur > 0 && (
                        <div
                          className={`w-full transition-colors ${
                            row.principalRepaidEur === 0 ? 'rounded-t-sm' : ''
                          } ${isHovered ? 'bg-teal-600' : 'bg-teal-700'}`}
                          style={{ height: `${Math.max(2, couponH)}%` }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2 pt-2 min-w-[600px]">
              {annualSchedule.map((row, idx) => {
                const showLabel =
                  annualSchedule.length <= 16 ||
                  idx % 2 === 0 ||
                  row.principalRepaidEur > 0;
                return (
                  <div
                    key={row.year}
                    className="flex-1 text-center min-w-[26px] text-[10px] font-mono tabular-nums text-slate-500"
                  >
                    {showLabel ? String(row.year).slice(-2) : ''}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-5 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm bg-teal-700 inline-block" />
              <span>Cedole Nette</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-sm bg-sky-600 inline-block" />
              <span>Rimborso Nominale a Scadenza</span>
            </div>
          </div>
        </div>
      )}

      {viewMode === 'annual_table' && (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                <th className="py-2.5 px-3">Anno</th>
                <th className="py-2.5 px-3 text-right">Cedole Lorde</th>
                <th className="py-2.5 px-3 text-right">Imposte Cedole</th>
                <th className="py-2.5 px-3 text-right">Cedole Nette</th>
                <th className="py-2.5 px-3 text-right">Rimborso Cap.</th>
                <th className="py-2.5 px-3 text-right">Bollo & CG</th>
                <th className="py-2.5 px-3 text-right">Flusso Netto Anno</th>
                <th className="py-2.5 px-3 text-right">Saldo Cumulato</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
              {annualSchedule.map((row) => (
                <tr
                  key={row.year}
                  className="hover:bg-slate-50/80 transition-colors"
                >
                  <td className="py-2 px-3 font-semibold text-slate-900">
                    {row.year}
                  </td>
                  <td className="py-2 px-3 text-right text-slate-700">
                    {formatEur(row.grossCouponsEur)}
                  </td>
                  <td className="py-2 px-3 text-right text-rose-700">
                    {row.couponTaxesEur > 0
                      ? `-${formatEur(row.couponTaxesEur)}`
                      : '—'}
                  </td>
                  <td className="py-2 px-3 text-right font-semibold text-teal-700">
                    {formatEur(row.netCouponsEur)}
                  </td>
                  <td className="py-2 px-3 text-right text-sky-700 font-medium">
                    {row.principalRepaidEur > 0
                      ? formatEur(row.principalRepaidEur)
                      : '—'}
                  </td>
                  <td className="py-2 px-3 text-right text-amber-700">
                    {row.bolloEur + row.otherTaxesEur > 0
                      ? `-${formatEur(row.bolloEur + row.otherTaxesEur)}`
                      : '—'}
                  </td>
                  <td className="py-2 px-3 text-right font-semibold text-slate-900">
                    {formatEur(row.totalNetInflowEur)}
                  </td>
                  <td
                    className={`py-2 px-3 text-right font-semibold ${
                      row.cumulativeNetFlowEur >= 0
                        ? 'text-emerald-700'
                        : 'text-slate-600'
                    }`}
                  >
                    {formatEur(row.cumulativeNetFlowEur)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
