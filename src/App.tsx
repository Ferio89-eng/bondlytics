import {
  AlertCircle,
  Link2,
  Plus,
  RefreshCw,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CapitalDistributor } from './components/CapitalDistributor.tsx';
import { CashflowLedger } from './components/CashflowLedger.tsx';
import { CompositionCharts } from './components/CompositionCharts.tsx';
import { CouponCharts } from './components/CouponCharts.tsx';
import { HoldingsTable } from './components/HoldingsTable.tsx';
import { PerformanceCostsPanel } from './components/PerformanceCostsPanel.tsx';
import { PortfolioManagerBar } from './components/PortfolioManagerBar.tsx';
import type {
  BondData,
  PortfolioHolding,
  PortfolioSettings,
  SavedPortfolio,
} from './types/portfolio.ts';
import {
  formatEur,
  formatNumber,
  formatPercent,
  PORTFOLIO_PALETTE,
} from './utils/formatters.ts';
import {
  calculateNominalPurchaseCost,
  calculatePortfolioAnalytics,
} from './utils/portfolioMath.ts';

const PORTFOLIOS_STORAGE_KEY = 'bondlytics_portfolios_v2';
// Previous app key, read only so an existing browser portfolio can be migrated.
const LEGACY_STORAGE_KEY = 'cedolapro_portfolio_state_v1';

const DEFAULT_SAMPLE_LINKS = [
  'https://www.simpletoolsforinvestors.eu/details.php?bondid=1843984&marketcode=MOT', // Romania 2039 6,75%
  'https://www.simpletoolsforinvestors.eu/details.php?bondid=8851&marketcode=MOT', // BTP 2054 4,30%
  'https://www.simpletoolsforinvestors.eu/details.php?bondid=7926&marketcode=MOT', // BTP 2052 2,15%
];

const QUICK_ADD_EXAMPLES = [
  {
    label: 'Romania 2039 6,75%',
    url: 'https://www.simpletoolsforinvestors.eu/details.php?bondid=1843984&marketcode=MOT',
  },
  {
    label: 'BTP 2054 4,30%',
    url: 'https://www.simpletoolsforinvestors.eu/details.php?bondid=8851&marketcode=MOT',
  },
  {
    label: 'BTP 2055 4,65%',
    url: 'https://www.simpletoolsforinvestors.eu/details.php?bondid=1844055&marketcode=MOT',
  },
  {
    label: 'Ford 2043 USD 4,75%',
    url: 'https://www.simpletoolsforinvestors.eu/details.php?bondid=8361&marketcode=EUROTLX',
  },
];

const DEFAULT_SETTINGS: PortfolioSettings = {
  totalCapital: 50000,
  commissionPercent: 0.19,
  includeBollo: true,
  bolloRatePercent: 0.2,
  roundToMinLot: true,
  fxRates: {},
};

/** Drops the old hardcoded placeholders so they are not treated as a chosen rate. */
function withoutPlaceholderFx(
  rates: Record<string, number> | undefined
): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [ccy, rate] of Object.entries(rates ?? {})) {
    if (ccy === 'USD' && rate === 1.08) continue;
    if (ccy === 'GBP' && rate === 0.85) continue;
    if (ccy === 'CHF' && rate === 0.94) continue;
    if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
      next[ccy] = rate;
    }
  }
  return next;
}

async function fetchLiveFxRates(): Promise<{
  rates: Record<string, number>;
  asOf: string;
}> {
  const res = await fetch('/api/fx');
  const data = (await res.json()) as {
    rates?: Record<string, number>;
    asOf?: string;
    error?: string;
  };
  if (!res.ok || !data.rates || typeof data.rates.USD !== 'number') {
    throw new Error(data.error || 'Cambio BCE non disponibile.');
  }
  return { rates: data.rates, asOf: data.asOf ?? '' };
}

function sanitizeSettings(raw?: Partial<PortfolioSettings>): PortfolioSettings {
  if (!raw) return { ...DEFAULT_SETTINGS, fxRates: {} };
  return {
    totalCapital:
      typeof raw.totalCapital === 'number'
        ? raw.totalCapital
        : DEFAULT_SETTINGS.totalCapital,
    commissionPercent:
      typeof raw.commissionPercent === 'number'
        ? raw.commissionPercent
        : DEFAULT_SETTINGS.commissionPercent,
    includeBollo:
      typeof raw.includeBollo === 'boolean'
        ? raw.includeBollo
        : DEFAULT_SETTINGS.includeBollo,
    bolloRatePercent:
      typeof raw.bolloRatePercent === 'number'
        ? raw.bolloRatePercent
        : DEFAULT_SETTINGS.bolloRatePercent,
    roundToMinLot:
      typeof raw.roundToMinLot === 'boolean'
        ? raw.roundToMinLot
        : DEFAULT_SETTINGS.roundToMinLot,
    fxRates: withoutPlaceholderFx(raw.fxRates),
  };
}

function generatePortfolioId(): string {
  return `pf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function distributeWeightsEvenly(items: PortfolioHolding[]): PortfolioHolding[] {
  if (items.length === 0) return [];
  const base = Math.floor((100 / items.length) * 10) / 10;
  return items.map((item, idx) => ({
    ...item,
    manualNominalCcy: null,
    weightPercent:
      idx === 0
        ? Number((100 - base * (items.length - 1)).toFixed(1))
        : base,
  }));
}

function snapWeightsToHundred(items: PortfolioHolding[]): PortfolioHolding[] {
  if (items.length === 0) return items;
  const rounded = items.map((h) => Math.round(h.weightPercent * 10) / 10);
  const sum = rounded.reduce((acc, weight) => acc + weight, 0);
  const drift = Math.round((100 - sum) * 10) / 10;
  if (drift !== 0) {
    const target = rounded.findIndex((weight) => weight + drift >= 0);
    const idx = target >= 0 ? target : 0;
    rounded[idx] = Math.round((rounded[idx] + drift) * 10) / 10;
  }
  return items.map((item, idx) => ({
    ...item,
    manualNominalCcy: null,
    weightPercent: rounded[idx],
  }));
}

function allocateWeightsForNewHoldings(
  next: PortfolioHolding[],
  newIds: string[],
  autoRebalance100: boolean
): PortfolioHolding[] {
  if (newIds.length === 0) return next;

  const oldSum = next
    .filter((h) => !newIds.includes(h.id))
    .reduce((sum, h) => sum + Math.max(0, h.weightPercent), 0);

  if (oldSum <= 0) {
    return distributeWeightsEvenly(next);
  }
  if (!autoRebalance100) {
    return next;
  }

  const share = 100 / next.length;
  const scale = (100 - share * newIds.length) / oldSum;
  const weighted = next.map((h) => ({
    ...h,
    manualNominalCcy: null,
    weightPercent: newIds.includes(h.id)
      ? share
      : Math.max(0, h.weightPercent) * scale,
  }));
  return snapWeightsToHundred(weighted);
}

export default function App() {
  const [portfolios, setPortfolios] = useState<SavedPortfolio[]>([
    {
      id: 'pf_default',
      name: 'Portafoglio Principale',
      updatedAt: new Date().toISOString(),
      holdings: [],
      settings: sanitizeSettings(),
      autoRebalance100: true,
    },
  ]);
  const [activePortfolioId, setActivePortfolioId] = useState<string>('pf_default');
  const [lastSavedLabel, setLastSavedLabel] = useState<string | null>(null);

  const [linkInput, setLinkInput] = useState<string>('');
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [isLoadingInitial, setIsLoadingInitial] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showCostConfig, setShowCostConfig] = useState<boolean>(false);
  const [previousWeightsBeforeEqualize, setPreviousWeightsBeforeEqualize] =
    useState<Record<string, number> | null>(null);
  const [liveFxRates, setLiveFxRates] = useState<Record<string, number>>({});
  const [fxAsOf, setFxAsOf] = useState<string | null>(null);

  const linkInputRef = useRef<HTMLInputElement>(null);

  const activePortfolio = useMemo(
    () => portfolios.find((p) => p.id === activePortfolioId) ?? portfolios[0],
    [portfolios, activePortfolioId]
  );

  const holdings = activePortfolio?.holdings ?? [];
  const settings = useMemo(() => {
    const base = activePortfolio?.settings ?? DEFAULT_SETTINGS;
    return {
      ...base,
      fxRates: {
        ...liveFxRates,
        ...withoutPlaceholderFx(base.fxRates),
      },
    };
  }, [activePortfolio, liveFxRates]);
  const autoRebalance100 = activePortfolio?.autoRebalance100 ?? true;

  // Hydrate multi-portfolio storage (with legacy single-portfolio migration) or fetch starter bonds
  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const rawV2 = localStorage.getItem(PORTFOLIOS_STORAGE_KEY);
        if (rawV2) {
          const parsedV2 = JSON.parse(rawV2) as {
            activePortfolioId?: string;
            portfolios?: SavedPortfolio[];
          };
          if (
            Array.isArray(parsedV2.portfolios) &&
            parsedV2.portfolios.length > 0
          ) {
            const sanitizedList: SavedPortfolio[] = parsedV2.portfolios.map(
              (p, idx) => ({
                id: p.id || `pf_${idx}`,
                name: p.name || `Portafoglio ${idx + 1}`,
                updatedAt: p.updatedAt || new Date().toISOString(),
                holdings: Array.isArray(p.holdings) ? p.holdings : [],
                settings: sanitizeSettings(p.settings),
                autoRebalance100:
                  typeof p.autoRebalance100 === 'boolean'
                    ? p.autoRebalance100
                    : true,
              })
            );
            setPortfolios(sanitizedList);
            const targetId =
              parsedV2.activePortfolioId &&
              sanitizedList.some((p) => p.id === parsedV2.activePortfolioId)
                ? parsedV2.activePortfolioId
                : sanitizedList[0].id;
            setActivePortfolioId(targetId);
            setIsLoadingInitial(false);
            return;
          }
        }

        // Migrate legacy v1 state if present
        const rawLegacy = localStorage.getItem(LEGACY_STORAGE_KEY);
        if (rawLegacy) {
          const parsedLegacy = JSON.parse(rawLegacy) as {
            holdings?: PortfolioHolding[];
            settings?: Partial<PortfolioSettings>;
          };
          if (
            Array.isArray(parsedLegacy.holdings) &&
            parsedLegacy.holdings.length > 0
          ) {
            const migrated: SavedPortfolio = {
              id: 'pf_default',
              name: 'Portafoglio Principale',
              updatedAt: new Date().toISOString(),
              holdings: parsedLegacy.holdings,
              settings: sanitizeSettings(parsedLegacy.settings),
              autoRebalance100: true,
            };
            setPortfolios([migrated]);
            setActivePortfolioId(migrated.id);
            setIsLoadingInitial(false);
            return;
          }
        }
      } catch {
        // Ignore malformed localStorage
      }

      // Fetch real default instruments from simpletoolsforinvestors.eu
      try {
        const res = await fetch('/api/bonds/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: DEFAULT_SAMPLE_LINKS }),
        });
        if (!res.ok) {
          throw new Error('Impossibile caricare gli strumenti iniziali.');
        }
        const data = (await res.json()) as { bonds: BondData[] };
        if (!cancelled && Array.isArray(data.bonds) && data.bonds.length > 0) {
          const initialHoldings: PortfolioHolding[] = data.bonds.map(
            (bond, idx) => ({
              id: `${bond.bondId}-${bond.marketCode}`,
              bond,
              weightPercent: idx === 0 ? 40 : 30,
              color: PORTFOLIO_PALETTE[idx % PORTFOLIO_PALETTE.length],
            })
          );
          setPortfolios([
            {
              id: 'pf_default',
              name: 'Portafoglio Principale',
              updatedAt: new Date().toISOString(),
              holdings: initialHoldings,
              settings: sanitizeSettings(),
              autoRebalance100: true,
            },
          ]);
          setActivePortfolioId('pf_default');
        }
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(
            err instanceof Error
              ? err.message
              : 'Errore nel caricamento iniziale dei titoli.'
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingInitial(false);
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-persist all portfolios to localStorage
  useEffect(() => {
    if (isLoadingInitial) return;
    try {
      localStorage.setItem(
        PORTFOLIOS_STORAGE_KEY,
        JSON.stringify({ activePortfolioId, portfolios })
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [portfolios, activePortfolioId, isLoadingInitial]);

  useEffect(() => {
    let cancelled = false;
    fetchLiveFxRates()
      .then((fx) => {
        if (cancelled) return;
        setLiveFxRates(fx.rates);
        setFxAsOf(fx.asOf || null);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setErrorMessage(
            err instanceof Error ? err.message : 'Cambio BCE non disponibile.'
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateActivePortfolio(
    updater: (prev: SavedPortfolio) => SavedPortfolio
  ) {
    setPortfolios((prevList) =>
      prevList.map((p) => {
        if (p.id !== activePortfolio?.id) return p;
        const next = updater(p);
        return { ...next, updatedAt: new Date().toISOString() };
      })
    );
  }

  function updateActiveHoldings(
    updater: (prev: PortfolioHolding[]) => PortfolioHolding[]
  ) {
    updateActivePortfolio((p) => ({
      ...p,
      holdings: updater(p.holdings),
    }));
  }

  function updateActiveSettings(
    updater: (prev: PortfolioSettings) => PortfolioSettings
  ) {
    updateActivePortfolio((p) => ({
      ...p,
      settings: updater(p.settings),
    }));
  }

  const analytics = useMemo(
    () => calculatePortfolioAnalytics(holdings, settings),
    [holdings, settings]
  );

  const foreignCurrencies = useMemo(() => {
    const set = new Set<string>();
    for (const h of holdings) {
      if (h.bond.currency && h.bond.currency !== 'EUR') {
        set.add(h.bond.currency);
      }
    }
    return Array.from(set);
  }, [holdings]);

  // Multi-portfolio actions
  function handleSelectPortfolio(id: string) {
    setActivePortfolioId(id);
    setPreviousWeightsBeforeEqualize(null);
    setErrorMessage(null);
    setLastSavedLabel(null);
  }

  function handleRenamePortfolio(id: string, newName: string) {
    setPortfolios((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, name: newName, updatedAt: new Date().toISOString() }
          : p
      )
    );
  }

  function handleCreatePortfolio(name: string, duplicateActive: boolean) {
    const newId = generatePortfolioId();
    const clonedHoldings =
      duplicateActive && activePortfolio
        ? activePortfolio.holdings.map((h) => ({ ...h }))
        : [];
    const clonedSettings =
      duplicateActive && activePortfolio
        ? sanitizeSettings(activePortfolio.settings)
        : sanitizeSettings();

    const newPortfolio: SavedPortfolio = {
      id: newId,
      name,
      updatedAt: new Date().toISOString(),
      holdings: clonedHoldings,
      settings: clonedSettings,
      autoRebalance100: duplicateActive && activePortfolio ? activePortfolio.autoRebalance100 : true,
    };

    setPortfolios((prev) => [...prev, newPortfolio]);
    setActivePortfolioId(newId);
    setPreviousWeightsBeforeEqualize(null);
    setErrorMessage(null);
    setLastSavedLabel('Nuovo portafoglio creato');
  }

  function handleDeletePortfolio(id: string) {
    setPortfolios((prev) => {
      if (prev.length <= 1) return prev;
      const filtered = prev.filter((p) => p.id !== id);
      if (activePortfolioId === id && filtered.length > 0) {
        setActivePortfolioId(filtered[0].id);
      }
      return filtered;
    });
    setPreviousWeightsBeforeEqualize(null);
    setErrorMessage(null);
  }

  function handleSaveActivePortfolio() {
    const now = new Date();
    const timeLabel = now.toLocaleTimeString('it-IT', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    updateActivePortfolio((p) => ({ ...p, updatedAt: now.toISOString() }));
    setLastSavedLabel(`Salvato alle ${timeLabel}`);
  }

  async function addBondUrls(rawInput: string) {
    const urls = rawInput
      .split(/[\s,\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (urls.length === 0) {
      setErrorMessage('Inserisci almeno un link valido di simpletoolsforinvestors.eu.');
      return;
    }

    setErrorMessage(null);
    setIsAdding(true);

    try {
      const res = await fetch('/api/bonds/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      const data = (await res.json()) as {
        bonds?: BondData[];
        errors?: { url: string; error: string }[];
        error?: string;
      };

      if (!res.ok) {
        throw new Error(data.error || 'Errore nella richiesta.');
      }

      const loadedBonds = data.bonds ?? [];
      if (loadedBonds.length > 0) {
        updateActiveHoldings((prev) => {
          const next = [...prev];
          const newIds: string[] = [];
          for (const bond of loadedBonds) {
            const id = `${bond.bondId}-${bond.marketCode}`;
            const existingIdx = next.findIndex((item) => item.id === id);
            if (existingIdx >= 0) {
              next[existingIdx] = { ...next[existingIdx], bond };
            } else {
              const color =
                PORTFOLIO_PALETTE[next.length % PORTFOLIO_PALETTE.length];
              next.push({
                id,
                bond,
                weightPercent: 0,
                color,
              });
              newIds.push(id);
            }
          }
          return allocateWeightsForNewHoldings(next, newIds, autoRebalance100);
        });
        setLinkInput('');
      }

      if (data.errors && data.errors.length > 0) {
        setErrorMessage(data.errors[0].error);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Impossibile recuperare lo strumento richiesto.'
      );
    } finally {
      setIsAdding(false);
    }
  }

  async function handleRefreshAll() {
    if (holdings.length === 0) return;
    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      try {
        const fx = await fetchLiveFxRates();
        setLiveFxRates(fx.rates);
        setFxAsOf(fx.asOf || null);
      } catch (fxErr) {
        setErrorMessage(
          fxErr instanceof Error ? fxErr.message : 'Cambio BCE non disponibile.'
        );
      }
      const urls = holdings.map((h) => h.bond.sourceUrl);
      const res = await fetch('/api/bonds/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });
      const data = (await res.json()) as {
        bonds?: BondData[];
        errors?: { url: string; error: string }[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(
          data.error || 'Errore durante l’aggiornamento delle quotazioni.'
        );
      }
      if (Array.isArray(data.bonds)) {
        const byId = new Map(
          data.bonds.map((b) => [`${b.bondId}-${b.marketCode}`, b])
        );
        updateActiveHoldings((prev) =>
          prev.map((h) => {
            const updated = byId.get(h.id);
            return updated ? { ...h, bond: updated } : h;
          })
        );
      }
      if (data.errors && data.errors.length > 0) {
        setErrorMessage(data.errors[0].error);
      }
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Errore durante l’aggiornamento delle quotazioni.'
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  function handleResetActiveSample() {
    setIsRefreshing(true);
    setErrorMessage(null);
    fetch('/api/bonds/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: DEFAULT_SAMPLE_LINKS }),
    })
      .then(async (r) => {
        const data = (await r.json()) as { bonds?: BondData[]; error?: string };
        if (!r.ok) {
          throw new Error(data.error || 'Impossibile ripristinare l’esempio.');
        }
        return data;
      })
      .then((data) => {
        if (Array.isArray(data.bonds) && data.bonds.length > 0) {
          updateActivePortfolio((p) => ({
            ...p,
            settings: sanitizeSettings(),
            autoRebalance100: true,
            holdings: data.bonds!.map((bond, idx) => ({
              id: `${bond.bondId}-${bond.marketCode}`,
              bond,
              weightPercent: idx === 0 ? 40 : 30,
              color: PORTFOLIO_PALETTE[idx % PORTFOLIO_PALETTE.length],
            })),
          }));
          setPreviousWeightsBeforeEqualize(null);
        }
      })
      .catch((err: unknown) => {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : 'Impossibile ripristinare l’esempio.'
        );
      })
      .finally(() => setIsRefreshing(false));
  }

  function handleTotalCapitalChange(nextCapital: number) {
    updateActivePortfolio((p) => ({
      ...p,
      settings: {
        ...p.settings,
        totalCapital: Math.max(0, nextCapital),
      },
      holdings: p.holdings.some((h) => typeof h.manualNominalCcy === 'number')
        ? p.holdings.map((h) => ({ ...h, manualNominalCcy: null }))
        : p.holdings,
    }));
  }

  function handleToggleAutoRebalance(enabled: boolean) {
    updateActivePortfolio((p) => ({ ...p, autoRebalance100: enabled }));
  }

  function handleUpdateWeight(id: string, weightPercent: number) {
    const clamped = Math.max(0, Math.min(100, weightPercent));
    updateActiveHoldings((prev) => {
      if (!autoRebalance100 || prev.length <= 1) {
        return prev.map((h) =>
          h.id === id
            ? { ...h, weightPercent: clamped, manualNominalCcy: null }
            : h
        );
      }

      const roundedClamped = Number(clamped.toFixed(1));
      const remainingTarget = Math.max(0, 100 - roundedClamped);
      const others = prev.filter((h) => h.id !== id);
      const othersSum = others.reduce(
        (s, h) => s + Math.max(0, h.weightPercent),
        0
      );

      const next = prev.map((h) => {
        if (h.id === id) {
          return {
            ...h,
            weightPercent: roundedClamped,
            manualNominalCcy: null,
          };
        }
        const nextOtherWeight =
          othersSum > 0
            ? (Math.max(0, h.weightPercent) / othersSum) * remainingTarget
            : remainingTarget / others.length;
        return {
          ...h,
          weightPercent: Number(nextOtherWeight.toFixed(1)),
          manualNominalCcy: null,
        };
      });

      const sum = next.reduce((acc, h) => acc + h.weightPercent, 0);
      const drift = Number((100 - sum).toFixed(1));
      if (drift !== 0) {
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].id === id) continue;
          const adjusted = Number((next[i].weightPercent + drift).toFixed(1));
          if (adjusted < 0) continue;
          next[i] = { ...next[i], weightPercent: adjusted };
          break;
        }
      }
      return next;
    });
  }

  function handleUpdateNominal(id: string, nominalCcy: number) {
    const safeNominal = Math.max(0, nominalCcy);
    updateActiveHoldings((prev) =>
      prev.map((h) => {
        if (h.id !== id) return h;
        const { settlementOutlayEur } = calculateNominalPurchaseCost(
          h,
          safeNominal,
          settings
        );
        const derivedWeight =
          settings.totalCapital > 0
            ? (settlementOutlayEur / settings.totalCapital) * 100
            : h.weightPercent;
        return {
          ...h,
          manualNominalCcy: safeNominal,
          weightPercent: Number(derivedWeight.toFixed(1)),
        };
      })
    );
  }

  function handleClearManualNominals() {
    updateActiveHoldings((prev) =>
      prev.map((h) => ({ ...h, manualNominalCcy: null }))
    );
  }

  function handleUpdatePurchaseDate(id: string, purchaseIsoDate: string) {
    updateActiveHoldings((prev) =>
      prev.map((h) => (h.id === id ? { ...h, purchaseIsoDate } : h))
    );
  }

  function handleEqualizeWeights() {
    if (holdings.length <= 1) return;
    const snapshot: Record<string, number> = {};
    for (const h of holdings) {
      snapshot[h.id] = h.weightPercent;
    }
    setPreviousWeightsBeforeEqualize(snapshot);
    updateActiveHoldings((prev) => distributeWeightsEvenly(prev));
  }

  function handleUndoEqualize() {
    if (!previousWeightsBeforeEqualize) return;
    updateActiveHoldings((prev) =>
      prev.map((h) =>
        Object.prototype.hasOwnProperty.call(previousWeightsBeforeEqualize, h.id)
          ? {
              ...h,
              weightPercent: previousWeightsBeforeEqualize[h.id],
              manualNominalCcy: null,
            }
          : h
      )
    );
    setPreviousWeightsBeforeEqualize(null);
  }

  function handleRemoveHolding(id: string) {
    updateActiveHoldings((prev) => prev.filter((h) => h.id !== id));
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar Contract: strictly 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-8">
          <a
            href="#configurazione"
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Bondlytics
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a
              href="#distribuzione"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Distribuzione
            </a>
            <a
              href="#strumenti"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Strumenti
            </a>
            <a
              href="#composizione"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Composizione
            </a>
            <a
              href="#rendimenti"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Rendimenti & Costi
            </a>
            <a
              href="#cedole"
              className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Piano Cedolare
            </a>
          </nav>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => {
                linkInputRef.current?.focus();
                linkInputRef.current?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'center',
                });
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Aggiungi Titolo</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1360px] mx-auto px-4 sm:px-8 py-8 space-y-8">
        {/* Multi-Portfolio Management Bar */}
        <PortfolioManagerBar
          portfolios={portfolios}
          activePortfolioId={activePortfolio?.id ?? ''}
          lastSavedLabel={lastSavedLabel}
          onSelectPortfolio={handleSelectPortfolio}
          onRenamePortfolio={handleRenamePortfolio}
          onCreatePortfolio={handleCreatePortfolio}
          onDeletePortfolio={handleDeletePortfolio}
          onSaveActivePortfolio={handleSaveActivePortfolio}
        />

        {/* Page Title & Variable Capital Control Bar */}
        <section
          id="configurazione"
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-6"
        >
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pb-6 border-b border-slate-100">
            <div className="space-y-1.5 max-w-2xl">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                {activePortfolio?.name || 'Portafoglio'}
              </h1>
              <p className="text-sm text-slate-600">
                Imposta il capitale da investire e inserisci i link delle schede titolo da{' '}
                <span className="font-mono text-xs text-slate-700">
                  simpletoolsforinvestors.eu
                </span>{' '}
                per calcolare rendimenti netti reali, commissioni, fiscalità e flussi di cassa.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={() => setShowCostConfig((v) => !v)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showCostConfig
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Costi & Impostazioni</span>
              </button>

              <button
                type="button"
                onClick={handleRefreshAll}
                disabled={isRefreshing || holdings.length === 0}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                />
                <span>Aggiorna Dati</span>
              </button>

              <button
                type="button"
                onClick={handleResetActiveSample}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Ripristina Esempio</span>
              </button>
            </div>
          </div>

          {/* Primary Variable: Capitale da investire + Link Inserter */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Capital Variable Control */}
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="capital-input"
                  className="text-xs font-semibold text-slate-700"
                >
                  Capitale da investire (€)
                </label>
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  Effettivo: {formatEur(analytics.totalInitialOutlayEur, 0)}
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-mono font-semibold text-slate-500">
                    €
                  </span>
                  <input
                    id="capital-input"
                    type="number"
                    min={1000}
                    max={50000000}
                    step={1000}
                    value={settings.totalCapital}
                    onChange={(e) => {
                      const val = Number.parseFloat(e.target.value);
                      handleTotalCapitalChange(Number.isFinite(val) ? val : 0);
                    }}
                    className="w-full pl-8 pr-4 py-2.5 text-base font-mono tabular-nums font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                </div>
              </div>

              <input
                type="range"
                min={5000}
                max={500000}
                step={5000}
                value={Math.min(500000, settings.totalCapital)}
                onChange={(e) => handleTotalCapitalChange(Number(e.target.value))}
                aria-label="Selettore capitale da investire"
                className="w-full workstation-slider"
              />

              <div className="flex flex-wrap items-center gap-1.5">
                {[25000, 50000, 100000, 250000].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleTotalCapitalChange(preset)}
                    className={`px-2.5 py-1 text-[11px] font-mono tabular-nums rounded-md border transition-colors cursor-pointer ${
                      settings.totalCapital === preset
                        ? 'bg-teal-700 text-white border-teal-700'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {formatEur(preset, 0)}
                  </button>
                ))}
              </div>
            </div>

            {/* Link Input Form */}
            <div className="lg:col-span-7 space-y-3">
              <label
                htmlFor="bond-url-input"
                className="block text-xs font-semibold text-slate-700"
              >
                Inserisci link strumento (SimpleToolsForInvestors)
              </label>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  addBondUrls(linkInput);
                }}
                className="flex flex-col sm:flex-row gap-2.5"
              >
                <div className="relative flex-1">
                  <Link2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    ref={linkInputRef}
                    id="bond-url-input"
                    type="text"
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                    placeholder="https://www.simpletoolsforinvestors.eu/details.php?bondid=1843984&marketcode=MOT"
                    className="w-full pl-10 pr-4 py-2.5 text-sm text-slate-900 bg-slate-50 border border-slate-200 rounded-lg placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isAdding || !linkInput.trim()}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-teal-700 rounded-lg hover:bg-teal-800 transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>{isAdding ? 'Caricamento...' : 'Aggiungi al Portafoglio'}</span>
                </button>
              </form>

              {errorMessage && (
                <div
                  role="alert"
                  className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"
                >
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500">Aggiungi rapido:</span>
                {QUICK_ADD_EXAMPLES.map((ex) => (
                  <button
                    key={ex.url}
                    type="button"
                    disabled={isAdding}
                    onClick={() => addBondUrls(ex.url)}
                    className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
                  >
                    + {ex.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Expandable Cost & Tax Configuration Strip */}
          {showCostConfig && (
            <div className="pt-5 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
              <div className="space-y-2">
                <label
                  htmlFor="commission-percent-input"
                  className="block text-xs font-semibold text-slate-700"
                >
                  Commissione broker (%)
                </label>
                <div className="relative">
                  <input
                    id="commission-percent-input"
                    type="number"
                    step="0.001"
                    min="0"
                    max="100"
                    value={settings.commissionPercent}
                    onChange={(e) => {
                      const val = Number.parseFloat(e.target.value);
                      updateActiveSettings((p) => ({
                        ...p,
                        commissionPercent:
                          Number.isFinite(val) && val >= 0 ? val : 0,
                      }));
                    }}
                    className="w-full pl-3 pr-8 py-2 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600/20 focus:border-teal-600"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-slate-400">
                    %
                  </span>
                </div>
                <p className="text-[11px] font-mono tabular-nums text-slate-500">
                  Su € 10.000 = {formatEur((10000 * settings.commissionPercent) / 100)}
                </p>
              </div>

              <div className="space-y-2.5 pt-1">
                <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.includeBollo}
                    onChange={(e) =>
                      updateActiveSettings((p) => ({
                        ...p,
                        includeBollo: e.target.checked,
                      }))
                    }
                    className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                  />
                  <span>Includi imposta di bollo (0,20% / anno, esclusi i titoli di Stato)</span>
                </label>

                <label className="flex items-center gap-2.5 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.roundToMinLot}
                    onChange={(e) =>
                      updateActiveSettings((p) => ({
                        ...p,
                        roundToMinLot: e.target.checked,
                      }))
                    }
                    className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                  />
                  <span>Arrotonda al Taglio Minimo negoziabile</span>
                </label>
              </div>

              {foreignCurrencies.length > 0 && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Tasso BCE, unità di valuta per 1 EUR
                    {fxAsOf ? ` · ${fxAsOf}` : ''}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {foreignCurrencies.map((ccy) => (
                      <div key={ccy} className="flex items-center gap-1.5">
                        <span className="text-xs font-mono text-slate-600">
                          EUR/{ccy}
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0.1"
                          value={settings.fxRates[ccy] ?? ''}
                          onChange={(e) => {
                            const val = Number.parseFloat(e.target.value);
                            if (Number.isFinite(val) && val > 0) {
                              updateActiveSettings((p) => ({
                                ...p,
                                fxRates: { ...p.fxRates, [ccy]: val },
                              }));
                            }
                          }}
                          className="w-20 px-2.5 py-1.5 text-xs font-mono tabular-nums bg-white border border-slate-200 rounded-lg"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Full-Width 4-Column KPI Summary Strip */}
        <section
          aria-label="Indicatori chiave di portafoglio"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        >
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs font-medium text-slate-500">
              Rendimento Annuo Netto Reale
            </div>
            <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-teal-700">
              {formatPercent(analytics.portfolioRealNetIrrPercent)}
            </div>
            <div className="mt-1.5 text-xs text-slate-500 font-mono tabular-nums">
              Lordo {formatPercent(analytics.portfolioGrossIrrPercent)} · Netto fisc.{' '}
              {formatPercent(analytics.portfolioNetIrrPercent)}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs font-medium text-slate-500">
              Flusso Cedolare Annuo Netto
            </div>
            <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {formatEur(analytics.annualNetCouponEur)}
            </div>
            <div className="mt-1.5 text-xs text-slate-500 font-mono tabular-nums">
              Media {formatEur(analytics.monthlyAvgNetCouponEur)} / mese · Lordo{' '}
              {formatEur(analytics.annualGrossCouponEur, 0)}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs font-medium text-slate-500">
              Capitale Investito & Liquidità Residua
            </div>
            <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {formatEur(analytics.totalInitialOutlayEur, 0)}
            </div>
            <div className="mt-1.5 text-xs text-slate-500 font-mono tabular-nums">
              Residuo non investito: {formatEur(analytics.uninvestedCashEur, 0)}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="text-xs font-medium text-slate-500">
              Costi Totali & Fiscalità a Scadenza
            </div>
            <div className="mt-1.5 text-2xl font-bold font-mono tabular-nums text-rose-700">
              -{formatEur(analytics.totalAllCostsAndTaxesEur, 0)}
            </div>
            <div className="mt-1.5 text-xs text-slate-500 font-mono tabular-nums">
              Comm. {formatEur(analytics.totalCommissionsEur, 0)} · Incidenza{' '}
              {formatNumber(analytics.annualCostDragPercent, 2)}%/anno
            </div>
          </div>
        </section>

        {/* 1. Interactive Capital Distribution & Nominal Purchase Simulator */}
        <CapitalDistributor
          analytics={analytics}
          autoRebalance100={autoRebalance100}
          onToggleAutoRebalance={handleToggleAutoRebalance}
          onUpdateWeight={handleUpdateWeight}
          onUpdateNominal={handleUpdateNominal}
          onClearManualNominals={handleClearManualNominals}
        />

        {/* 2. Holdings Table */}
        <section id="strumenti" className="scroll-mt-20">
          <HoldingsTable
            analytics={analytics}
            portfolioName={activePortfolio?.name}
            onUpdatePurchaseDate={handleUpdatePurchaseDate}
            onEqualizeWeights={handleEqualizeWeights}
            onUndoEqualize={handleUndoEqualize}
            canUndoEqualize={previousWeightsBeforeEqualize !== null}
            onRemoveHolding={handleRemoveHolding}
            isLoadingInitial={isLoadingInitial}
          />
        </section>

        {/* Portfolio Composition Section */}
        <section id="composizione" className="scroll-mt-20">
          <CompositionCharts analytics={analytics} />
        </section>

        {/* Performance & Costs Section */}
        <section id="rendimenti" className="scroll-mt-20">
          <PerformanceCostsPanel analytics={analytics} settings={settings} />
        </section>

        {/* Coupon Schedule Section */}
        <section id="cedole" className="scroll-mt-20 space-y-6">
          <CouponCharts analytics={analytics} />
          <CashflowLedger analytics={analytics} />
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white mt-12">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <span>
            Bondlytics — Analisi quantitativa di portafogli obbligazionari
          </span>
          <span>
            Dati titoli estratti in tempo reale dalle schede tecniche di SimpleToolsForInvestors.eu
          </span>
        </div>
      </footer>
    </div>
  );
}
