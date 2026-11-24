import { Download, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PortfolioAnalytics } from '../types/portfolio.ts';
import { formatEur } from '../utils/formatters.ts';

interface CashflowLedgerProps {
  analytics: PortfolioAnalytics;
}

type EventFilter = 'coupons' | 'redemptions_taxes' | 'all';

export function CashflowLedger({ analytics }: CashflowLedgerProps) {
  const [selectedIsin, setSelectedIsin] = useState<string>('ALL');
  const [eventFilter, setEventFilter] = useState<EventFilter>('coupons');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showAllRows, setShowAllRows] = useState<boolean>(false);

  const uniqueBonds = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of analytics.holdings) {
      map.set(h.holding.bond.isin, h.holding.bond.description);
    }
    return Array.from(map.entries());
  }, [analytics.holdings]);

  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return analytics.cashflowLedger.filter((ev) => {
      if (selectedIsin !== 'ALL' && ev.isin !== selectedIsin) return false;

      if (eventFilter === 'coupons') {
        if (ev.category !== 'coupon_gross' && ev.category !== 'coupon_tax') {
          return false;
        }
      } else if (eventFilter === 'redemptions_taxes') {
        if (
          ev.category !== 'principal_in' &&
          ev.category !== 'capital_gain_tax' &&
          ev.category !== 'disaggio_debit' &&
          ev.category !== 'commission_out'
        ) {
          return false;
        }
      }

      if (q) {
        const hay = `${ev.date} ${ev.isin} ${ev.bondDescription} ${ev.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }

      return true;
    });
  }, [analytics.cashflowLedger, selectedIsin, eventFilter, searchQuery]);

  const visibleEvents = showAllRows
    ? filteredEvents
    : filteredEvents.slice(0, 24);

  const filteredTotalEur = filteredEvents.reduce(
    (sum, ev) => sum + ev.amountEur,
    0
  );

  function handleExportCsv() {
    const header = ['Data', 'ISIN', 'Strumento', 'Descrizione Evento', 'Importo EUR'];
    const lines = [
      header.join(';'),
      ...filteredEvents.map((ev) =>
        [
          ev.date,
          ev.isin,
          `"${ev.bondDescription.replace(/"/g, '""')}"`,
          `"${ev.description.replace(/"/g, '""')}"`,
          ev.amountEur.toFixed(2).replace('.', ','),
        ].join(';')
      ),
    ];
    const csvContent = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `piano_cedolare_portafoglio.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            Registro Dettagliato Flussi e Stacchi Cedole
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Cronologia completa di cedole lorde, ritenute fiscali, ratei e rimborsi scalati sul capitale investito
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          disabled={filteredEvents.length === 0}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 self-start lg:self-auto cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Esporta CSV</span>
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setEventFilter('coupons')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              eventFilter === 'coupons'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Solo Cedole
          </button>
          <button
            type="button"
            onClick={() => setEventFilter('redemptions_taxes')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              eventFilter === 'redemptions_taxes'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Rimborsi & Tasse
          </button>
          <button
            type="button"
            onClick={() => setEventFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              eventFilter === 'all'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tutti i Flussi
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <select
            value={selectedIsin}
            onChange={(e) => setSelectedIsin(e.target.value)}
            aria-label="Filtra per titolo"
            className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
          >
            <option value="ALL">Tutti gli strumenti ({uniqueBonds.length})</option>
            {uniqueBonds.map(([isin, desc]) => (
              <option key={isin} value={isin}>
                {isin} — {desc}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cerca data o descrizione..."
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600 w-full sm:w-52"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      {filteredEvents.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded-lg">
          Nessun flusso corrispondente ai filtri selezionati.
        </div>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                <th className="py-2.5 px-3">Data</th>
                <th className="py-2.5 px-3">Strumento</th>
                <th className="py-2.5 px-3">Evento</th>
                <th className="py-2.5 px-3 text-right">Importo (€)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {visibleEvents.map((ev, idx) => (
                <tr
                  key={`${ev.isoDate}-${ev.isin}-${ev.category}-${idx}`}
                  className="hover:bg-slate-50/70 transition-colors"
                >
                  <td className="py-2 px-3 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                    {ev.date}
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-sm shrink-0"
                        style={{ backgroundColor: ev.color }}
                      />
                      <span className="font-medium text-slate-900 truncate max-w-[260px]">
                        {ev.bondDescription}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
                        {ev.isin}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-slate-600">{ev.description}</td>
                  <td
                    className={`py-2 px-3 text-right font-mono tabular-nums font-medium whitespace-nowrap ${
                      ev.amountEur >= 0 ? 'text-teal-700' : 'text-rose-700'
                    }`}
                  >
                    {ev.amountEur >= 0 ? '+' : ''}
                    {formatEur(ev.amountEur)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t border-slate-200 text-xs font-semibold">
                <td colSpan={3} className="py-2.5 px-3 text-slate-700">
                  Saldo netto flussi filtrati ({filteredEvents.length} movimenti)
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-900">
                  {formatEur(filteredTotalEur)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {filteredEvents.length > 24 && (
        <div className="flex justify-center pt-1">
          <button
            type="button"
            onClick={() => setShowAllRows((prev) => !prev)}
            className="px-4 py-1.5 text-xs font-medium text-teal-700 hover:text-teal-800 hover:bg-teal-50 rounded-lg transition-colors cursor-pointer"
          >
            {showAllRows
              ? 'Mostra meno righe'
              : `Mostra tutti i ${filteredEvents.length} movimenti`}
          </button>
        </div>
      )}
    </div>
  );
}
