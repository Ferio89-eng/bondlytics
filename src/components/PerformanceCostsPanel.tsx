import type { PortfolioAnalytics, PortfolioSettings } from '../types/portfolio.ts';
import { formatEur, formatNumber, formatPercent } from '../utils/formatters.ts';

interface PerformanceCostsPanelProps {
  analytics: PortfolioAnalytics;
  settings: PortfolioSettings;
}

export function PerformanceCostsPanel({
  analytics,
  settings,
}: PerformanceCostsPanelProps) {
  const grossYield = analytics.portfolioGrossIrrPercent;
  const netYieldBondTax = analytics.portfolioNetIrrPercent;
  const realNetYield = analytics.portfolioRealNetIrrPercent;

  const taxDragPercent = Math.max(0, grossYield - netYieldBondTax);
  const feeBolloDragPercent = Math.max(0, netYieldBondTax - realNetYield);

  const initialAccruedNetEur = analytics.holdings.reduce(
    (s, h) => s + h.accruedNetEur,
    0
  );

  const extractedTaxRatesLabel =
    analytics.taxRatesBreakdown.length > 0
      ? analytics.taxRatesBreakdown
          .map((t) => `${formatNumber(t.rate, 1)}%`)
          .join(' · ')
      : '—';

  const costRows = [
    {
      label: 'Commissioni di negoziazione (acquisto)',
      note:
        settings.commissionPercent > 0
          ? `${formatNumber(settings.commissionPercent, 3)}% sul controvalore di ogni eseguito`
          : 'Nessuna commissione configurata (0,000%)',
      amountEur: analytics.totalCommissionsEur,
      kind: 'cost' as const,
    },
    {
      label: 'Imposta sostitutiva sulle cedole',
      note: `Estratta dai link SimpleToolsForInvestors (aliquote: ${extractedTaxRatesLabel})`,
      amountEur: analytics.totalCouponTaxesEur,
      kind: 'tax' as const,
    },
    {
      label: 'Tassazione Capital Gain e Disaggio di emissione',
      note: 'Applicata a scadenza su scarto di emissione e plusvalenza',
      amountEur: analytics.totalCapitalGainAndDisaggioTaxEur,
      kind: 'tax' as const,
    },
    {
      label: 'Imposta di bollo titoli stimata',
      note: settings.includeBollo
        ? `${settings.bolloRatePercent.toString().replace('.', ',')}% annuo sui titoli diversi dai titoli di Stato`
        : 'Esclusa dal calcolo (attivabile nelle impostazioni)',
      amountEur: analytics.totalEstimatedBolloEur,
      kind: 'tax' as const,
    },
  ];

  const barScaleMax = Math.max(1, grossYield);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Yield Waterfall & Performance */}
      <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="pb-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-900">
            Rendimento Annuo Composto (TIR / XIRR)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Confronto tra rendimento lordo, netto fiscale e netto reale dopo commissioni e bollo
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">
                Rendimento Lordo Portafoglio (TIR)
              </span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {formatPercent(grossYield)}
              </span>
            </div>
            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-slate-600 rounded-full transition-all duration-200"
                style={{ width: `${(grossYield / barScaleMax) * 100}%` }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">
                Rendimento Netto Fiscale (dopo imposte 12,5% / 26%)
              </span>
              <span className="font-mono tabular-nums font-semibold text-sky-700">
                {formatPercent(netYieldBondTax)}{' '}
                <span className="text-[11px] font-normal text-rose-700">
                  (-{formatPercent(taxDragPercent)})
                </span>
              </span>
            </div>
            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-600 rounded-full transition-all duration-200"
                style={{
                  width: `${Math.max(0, (netYieldBondTax / barScaleMax) * 100)}%`,
                }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-900">
                Rendimento Netto Reale (dopo commissioni e bollo)
              </span>
              <span className="font-mono tabular-nums font-bold text-teal-700">
                {formatPercent(realNetYield)}{' '}
                <span className="text-[11px] font-normal text-amber-700">
                  (-{formatPercent(feeBolloDragPercent)})
                </span>
              </span>
            </div>
            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-teal-700 rounded-full transition-all duration-200"
                style={{
                  width: `${Math.max(0, (realNetYield / barScaleMax) * 100)}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Summary KPI grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
          <div>
            <div className="text-[11px] text-slate-500">
              Guadagno Netto a Scadenza
            </div>
            <div className="text-base font-bold font-mono tabular-nums text-teal-700 mt-0.5">
              {formatEur(analytics.totalNetProfitAtMaturityEur)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">
              Capitale Rimborsato
            </div>
            <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {formatEur(analytics.totalRedemptionEur)}
            </div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">
              Scadenza Media Ponderata
            </div>
            <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {analytics.weightedAvgMaturityYears
                .toFixed(1)
                .replace('.', ',')}{' '}
              anni
            </div>
          </div>
        </div>
      </div>

      {/* Costs & Tax Breakdown */}
      <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Analisi Costi e Impatto Fiscale
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Dettaglio completo di commissioni broker, ritenute fiscali e imposta di bollo
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[11px] text-slate-500">Incidenza Annua</div>
            <div className="text-sm font-bold font-mono tabular-nums text-rose-700">
              -{formatPercent(analytics.annualCostDragPercent)}
            </div>
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {costRows.map((row) => (
            <div
              key={row.label}
              className="py-3 flex items-start justify-between gap-4"
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900">
                  {row.label}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {row.note}
                </div>
              </div>
              <div className="text-xs font-mono tabular-nums font-semibold text-rose-700 shrink-0">
                {row.amountEur > 0 ? `-${formatEur(row.amountEur)}` : formatEur(0)}
              </div>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-900">
            Totale Costi e Imposte sull&apos;intero orizzonte
          </span>
          <span className="font-mono tabular-nums font-bold text-rose-700 text-sm">
            -{formatEur(analytics.totalAllCostsAndTaxesEur)}
          </span>
        </div>

        <div className="bg-slate-50 border border-slate-100 rounded-lg px-4 py-3 flex items-center justify-between gap-4 text-xs">
          <div>
            <div className="font-medium text-slate-800">
              Rateo Netto Anticipato al Regolamento
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Esborso temporaneo incluso nel controvalore di acquisto, recuperato alla prima cedola
            </div>
          </div>
          <span className="font-mono tabular-nums font-semibold text-slate-900 shrink-0">
            {formatEur(initialAccruedNetEur)}
          </span>
        </div>
      </div>
    </div>
  );
}
