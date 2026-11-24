import { Download, ExternalLink, Scale, Trash2, Undo2 } from 'lucide-react';
import type { PortfolioAnalytics } from '../types/portfolio.ts';
import {
  extractIssuerName,
  formatCurrency,
  formatEur,
  formatNumber,
  formatPercent,
} from '../utils/formatters.ts';

interface HoldingsTableProps {
  analytics: PortfolioAnalytics;
  portfolioName?: string;
  onUpdatePurchaseDate: (id: string, purchaseIsoDate: string) => void;
  onEqualizeWeights: () => void;
  onUndoEqualize: () => void;
  canUndoEqualize: boolean;
  onRemoveHolding: (id: string) => void;
  isLoadingInitial: boolean;
}

function escapeCsvField(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function formatIsoToItalian(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export function HoldingsTable({
  analytics,
  portfolioName,
  onUpdatePurchaseDate,
  onEqualizeWeights,
  onUndoEqualize,
  canUndoEqualize,
  onRemoveHolding,
  isLoadingInitial,
}: HoldingsTableProps) {
  const { holdings, totalAllocatedWeightPercent } = analytics;
  const weightNeedsNotice =
    holdings.length > 0 && Math.abs(totalAllocatedWeightPercent - 100) > 0.2;

  function handleExportCsv() {
    if (holdings.length === 0) return;

    const header = [
      'Titolo',
      'ISIN',
      'Emittente',
      'Mercato',
      'Data Acquisto',
      'Scadenza',
      'Tassazione %',
      'Valuta',
      'Prezzo',
      'Peso Target %',
      'Peso Effettivo %',
      'Nominale',
      'Controvalore (EUR)',
      'Commissioni (EUR)',
      'Costo Totale (EUR)',
      'Rendimento Lordo %',
      'Rendimento Netto %',
      'Cedola Annua Netta (EUR)',
      'Link Scheda',
    ];

    const rows = holdings.map((hc) => {
      const { holding, effectivePurchaseIsoDate } = hc;
      const { bond } = holding;
      return [
        escapeCsvField(bond.description),
        escapeCsvField(bond.isin),
        escapeCsvField(extractIssuerName(bond.description)),
        escapeCsvField(bond.marketCode),
        formatIsoToItalian(effectivePurchaseIsoDate),
        bond.maturityDate,
        bond.taxRate.toFixed(1).replace('.', ','),
        escapeCsvField(bond.currency),
        bond.settlementPrice.toFixed(3).replace('.', ','),
        holding.weightPercent.toFixed(1).replace('.', ','),
        hc.effectiveWeightPercent.toFixed(1).replace('.', ','),
        Math.round(hc.nominalAmountCcy).toString(),
        hc.settlementOutlayEur.toFixed(2).replace('.', ','),
        hc.commissionEur.toFixed(2).replace('.', ','),
        hc.totalInitialCostEur.toFixed(2).replace('.', ','),
        bond.grossYield.toFixed(2).replace('.', ','),
        bond.netYield.toFixed(2).replace('.', ','),
        hc.annualNetCouponEur.toFixed(2).replace('.', ','),
        escapeCsvField(bond.sourceUrl),
      ].join(';');
    });

    const totalRow = [
      escapeCsvField(`Totale Portafoglio (${holdings.length} titoli)`),
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      totalAllocatedWeightPercent.toFixed(1).replace('.', ','),
      '100,0',
      '',
      analytics.totalInvestedExclCommEur.toFixed(2).replace('.', ','),
      analytics.totalCommissionsEur.toFixed(2).replace('.', ','),
      analytics.totalInitialOutlayEur.toFixed(2).replace('.', ','),
      analytics.portfolioGrossIrrPercent.toFixed(2).replace('.', ','),
      analytics.portfolioRealNetIrrPercent.toFixed(2).replace('.', ','),
      analytics.annualNetCouponEur.toFixed(2).replace('.', ','),
      '',
    ].join(';');

    const csvContent = '\uFEFF' + [header.join(';'), ...rows, totalRow].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const slug = (portfolioName || 'portafoglio')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const todayIso = new Date().toISOString().slice(0, 10);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug || 'portafoglio'}_strumenti_${todayIso}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Strumenti in Portafoglio
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Imposta la data di acquisto; i pesi % sono ereditati dalla sezione Distribuzione Capitale e Simulatore Acquisto
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
          {weightNeedsNotice && (
            <span className="text-xs font-mono tabular-nums text-amber-700 mr-1">
              Somma pesi: {formatPercent(totalAllocatedWeightPercent, 1)} (normalizzata a 100%)
            </span>
          )}
          {holdings.length > 1 && (
            <>
              <button
                type="button"
                onClick={onEqualizeWeights}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Scale className="w-3.5 h-3.5" />
                <span>Equidistribuisci</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (canUndoEqualize) onUndoEqualize();
                }}
                title={
                  canUndoEqualize
                    ? 'Torna ai pesi precedenti all’equidistribuzione'
                    : 'Disponibile dopo aver premuto Equidistribuisci'
                }
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  canUndoEqualize
                    ? 'text-slate-700 bg-white border-slate-200 hover:bg-slate-50 cursor-pointer'
                    : 'text-slate-400 bg-slate-50/60 border-slate-200/80 cursor-default'
                }`}
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Ripristina Precedenti</span>
              </button>
            </>
          )}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={holdings.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50 disabled:cursor-default whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Esporta CSV</span>
          </button>
        </div>
      </div>

      {isLoadingInitial && holdings.length === 0 ? (
        <div className="space-y-3 py-2">
          {[1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="h-12 bg-slate-100 rounded-lg animate-pulse"
            />
          ))}
        </div>
      ) : holdings.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-slate-200 rounded-lg space-y-2">
          <p className="text-sm font-medium text-slate-700">
            Nessuno strumento nel portafoglio
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Incolla uno o più link di simpletoolsforinvestors.eu nella barra qui sopra per analizzare composizione, costi e piano cedolare.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                <th className="py-2.5 px-3 min-w-[230px]">Titolo & ISIN</th>
                <th className="py-2.5 px-3">Data Acquisto</th>
                <th className="py-2.5 px-3 text-right">Prezzo</th>
                <th className="py-2.5 px-3 text-right w-28">Peso %</th>
                <th className="py-2.5 px-3 text-right">Nominale</th>
                <th className="py-2.5 px-3 text-right">Controvalore</th>
                <th className="py-2.5 px-3 text-right">Comm.</th>
                <th className="py-2.5 px-3 text-right">Rend. Lordo / Netto</th>
                <th className="py-2.5 px-3 text-right">Cedola / Anno (Netta)</th>
                <th className="py-2.5 px-3 text-right">Azioni</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {holdings.map((hc) => {
                const { holding, effectivePurchaseIsoDate } = hc;
                const { bond } = holding;
                const isCustomDate =
                  effectivePurchaseIsoDate !== bond.settlementIsoDate;
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
                          <div className="font-semibold text-slate-900 truncate max-w-[240px]">
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

                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="flex flex-col gap-0.5">
                        <input
                          type="date"
                          value={effectivePurchaseIsoDate}
                          max={bond.maturityIsoDate || undefined}
                          onChange={(e) =>
                            onUpdatePurchaseDate(
                              holding.id,
                              e.target.value || bond.settlementIsoDate
                            )
                          }
                          aria-label={`Data acquisto ${bond.description}`}
                          className="px-2 py-1 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-md text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                        />
                        {isCustomDate && (
                          <button
                            type="button"
                            onClick={() =>
                              onUpdatePurchaseDate(
                                holding.id,
                                bond.settlementIsoDate
                              )
                            }
                            className="text-[10px] text-left text-teal-700 hover:underline cursor-pointer"
                          >
                            Ripristina ({bond.settlementDate})
                          </button>
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      {formatNumber(bond.settlementPrice, 3)}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="font-semibold text-slate-900">
                        {formatPercent(holding.weightPercent, 1)}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
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
                      {hc.commissionEur > 0 ? formatEur(hc.commissionEur) : '€ 0,00'}
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
                      <div className="inline-flex items-center justify-end gap-1">
                        <a
                          href={bond.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Apri scheda su SimpleToolsForInvestors"
                          className="p-1.5 text-slate-500 hover:text-teal-700 hover:bg-teal-50 rounded-md transition-colors"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => onRemoveHolding(holding.id)}
                          title="Rimuovi strumento"
                          className="p-1.5 text-slate-500 hover:text-rose-700 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200 text-xs font-semibold font-mono tabular-nums">
                <td className="py-2.5 px-3 font-sans text-slate-700">
                  Totale Portafoglio ({holdings.length} titoli)
                </td>
                <td className="py-2.5 px-3" />
                <td className="py-2.5 px-3" />
                <td className="py-2.5 px-3 text-right text-slate-900">
                  {formatPercent(totalAllocatedWeightPercent, 1)}
                </td>
                <td className="py-2.5 px-3" />
                <td className="py-2.5 px-3 text-right text-slate-900">
                  {formatEur(analytics.totalInvestedExclCommEur)}
                </td>
                <td className="py-2.5 px-3 text-right text-rose-700">
                  {formatEur(analytics.totalCommissionsEur)}
                </td>
                <td className="py-2.5 px-3 text-right">
                  <span className="text-slate-600">
                    {formatPercent(analytics.portfolioGrossIrrPercent)}
                  </span>
                  <span className="text-slate-300 mx-1">/</span>
                  <span className="text-teal-700">
                    {formatPercent(analytics.portfolioRealNetIrrPercent)}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right text-teal-700">
                  {formatEur(analytics.annualNetCouponEur)}
                </td>
                <td className="py-2.5 px-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
