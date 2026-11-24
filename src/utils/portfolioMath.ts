import type {
  AnnualScheduleRow,
  BondCashflow,
  BondData,
  HoldingCalculation,
  MonthlySeasonalityRow,
  PortfolioAnalytics,
  PortfolioHolding,
  PortfolioSettings,
  ScaledCashflowEvent,
} from '../types/portfolio.ts';
import { isTitoloDiStato, ITALIAN_MONTHS_SHORT } from './formatters.ts';

interface TimedFlow {
  timeMs: number;
  amount: number;
}

function isoToTimeMs(isoDate: string): number {
  if (!isoDate) return Date.now();
  const parsed = Date.parse(`${isoDate}T00:00:00Z`);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function isoToItalianDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function italianDateToIso(dateStr: string): string {
  const m = dateStr.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return '';
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function subtractMonthsIso(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map((n) => Number.parseInt(n, 10));
  if (!y || !m || !d) return isoDate;
  const date = new Date(Date.UTC(y, m - 1 - months, 1));
  const lastDayOfTargetMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const clampedDay = Math.min(d, lastDayOfTargetMonth);
  const yy = String(date.getUTCFullYear()).padStart(4, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(clampedDay).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function parseIsoParts(isoDate: string): { y: number; m: number; d: number } | null {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    y: Number.parseInt(match[1], 10),
    m: Number.parseInt(match[2], 10),
    d: Number.parseInt(match[3], 10),
  };
}

/** Day count for 30/360 US and 30E/360, used when the bond convention is not ACT/ACT. */
function days30_360(startIso: string, endIso: string, european: boolean): number {
  const start = parseIsoParts(startIso);
  const end = parseIsoParts(endIso);
  if (!start || !end) return 0;

  let d1 = start.d;
  let d2 = end.d;
  if (european) {
    if (d1 === 31) d1 = 30;
    if (d2 === 31) d2 = 30;
  } else {
    if (d1 === 31) d1 = 30;
    if (d2 === 31 && d1 === 30) d2 = 30;
  }

  return (end.y - start.y) * 360 + (end.m - start.m) * 30 + (d2 - d1);
}

function accrualFraction(
  bond: BondData,
  prevIso: string,
  purchaseIso: string,
  nextIso: string
): number {
  const convention = (bond.accrualConvention || '').toUpperCase().replace(/\s+/g, '');
  const uses360 =
    convention.includes('30/360') ||
    convention.includes('30E/360') ||
    convention.includes('360/360');

  if (uses360) {
    const european = convention.includes('30E');
    const elapsed = days30_360(prevIso, purchaseIso, european);
    const total = Math.max(1, days30_360(prevIso, nextIso, european));
    return Math.max(0, Math.min(1, elapsed / total));
  }

  const prevMs = isoToTimeMs(prevIso);
  const nextMs = isoToTimeMs(nextIso);
  const purchMs = isoToTimeMs(purchaseIso);
  const totalPeriodMs = Math.max(86400000, nextMs - prevMs);
  const elapsedMs = Math.max(0, Math.min(totalPeriodMs, purchMs - prevMs));
  return elapsedMs / totalPeriodMs;
}

function dayCountFraction(
  convention: string,
  startIso: string,
  pointIso: string,
  endIso: string
): number {
  return accrualFraction(
    { accrualConvention: convention } as BondData,
    startIso,
    pointIso,
    endIso
  );
}

/** Tax on the issuance discount for the base quantity. Zero when the bond is not issued below par. */
function issuanceDiscountTax(bond: BondData): number {
  if (!(bond.issuePrice > 0) || !(bond.redemptionPrice > bond.issuePrice)) return 0;
  if (!(bond.baseQuantity > 0) || !(bond.taxRate > 0)) return 0;
  const discount =
    ((bond.redemptionPrice - bond.issuePrice) / 100) * bond.baseQuantity;
  return discount * (bond.taxRate / 100);
}

function unitsPerEur(currency: string, rates: Record<string, number>): number {
  if (!currency || currency === 'EUR') return 1;
  const rate = rates[currency];
  if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) return rate;
  return 0;
}

function toEurAmount(amount: number, unitsPerOneEur: number): number {
  if (!(unitsPerOneEur > 0) || !Number.isFinite(amount)) return 0;
  return amount / unitsPerOneEur;
}

function getFrequencyMonths(bond: BondData): number {
  const freq = (bond.couponFrequency || '').toLowerCase();
  if (freq.includes('trimestr')) return 3;
  if (freq.includes('semestr')) return 6;
  if (freq.includes('zero') || freq.includes('unica')) return 0;
  return 12;
}

/**
 * Reconstructs base-quantity cashflows for a custom purchase date.
 * If purchaseIsoDate === bond.settlementIsoDate, returns bond.cashflows and bond.settlementCountervalueBase verbatim.
 */
export function buildCashflowsForPurchaseDate(
  bond: BondData,
  purchaseIsoDate: string
): {
  effectivePurchaseIsoDate: string;
  cashflows: BondCashflow[];
  unitSettlementCcy: number;
} {
  const defaultSettlementIso = bond.settlementIsoDate || '2026-11-24';
  const cleanPurchaseIso = purchaseIsoDate || defaultSettlementIso;

  if (cleanPurchaseIso === defaultSettlementIso) {
    const unitSettlementCcy =
      bond.settlementCountervalueBase > 0
        ? bond.settlementCountervalueBase
        : (bond.settlementPrice / 100) * bond.baseQuantity;
    return {
      effectivePurchaseIsoDate: defaultSettlementIso,
      cashflows: bond.cashflows,
      unitSettlementCcy,
    };
  }

  const purchaseDateIt = isoToItalianDate(cleanPurchaseIso);
  const issueIso = italianDateToIso(bond.issueDate) || '2000-01-01';

  // 1. Collect all known future coupons from bond.cashflows
  const couponMap = new Map<
    string,
    { isoDate: string; date: string; gross: number; tax: number }
  >();

  for (const cf of bond.cashflows) {
    if (cf.category === 'coupon_gross') {
      const existing = couponMap.get(cf.isoDate) ?? {
        isoDate: cf.isoDate,
        date: cf.date,
        gross: 0,
        tax: 0,
      };
      existing.gross += cf.amount;
      couponMap.set(cf.isoDate, existing);
    } else if (cf.category === 'coupon_tax') {
      const existing = couponMap.get(cf.isoDate) ?? {
        isoDate: cf.isoDate,
        date: cf.date,
        gross: 0,
        tax: 0,
      };
      existing.tax += cf.amount; // negative
      couponMap.set(cf.isoDate, existing);
    }
  }

  // 2. Supplement with Piano cedolare (for non-standard bonds like Romania)
  if (bond.couponSchedule.length > 0) {
    for (const item of bond.couponSchedule) {
      if (!couponMap.has(item.isoDate) && item.ratePercent > 0) {
        const gross = (item.ratePercent / 100) * bond.baseQuantity;
        const tax = -(gross * (bond.taxRate / 100));
        couponMap.set(item.isoDate, {
          isoDate: item.isoDate,
          date: item.date,
          gross,
          tax,
        });
      }
    }
  } else {
    // Standard bond: step backwards from earliest known coupon down to issueDate
    const sortedKnown = Array.from(couponMap.values()).sort((a, b) =>
      a.isoDate.localeCompare(b.isoDate)
    );
    const periodMonths = getFrequencyMonths(bond);
    if (sortedKnown.length > 0 && periodMonths > 0) {
      const stdGross = sortedKnown[0].gross;
      const stdTax =
        sortedKnown[0].tax !== 0
          ? sortedKnown[0].tax
          : -(stdGross * (bond.taxRate / 100));

      let cursorIso = sortedKnown[0].isoDate;
      for (let i = 0; i < 120; i++) {
        cursorIso = subtractMonthsIso(cursorIso, periodMonths);
        if (cursorIso <= issueIso) break;
        if (!couponMap.has(cursorIso)) {
          couponMap.set(cursorIso, {
            isoDate: cursorIso,
            date: isoToItalianDate(cursorIso),
            gross: stdGross,
            tax: stdTax,
          });
        }
      }
    }
  }

  const allCoupons = Array.from(couponMap.values()).sort((a, b) =>
    a.isoDate.localeCompare(b.isoDate)
  );

  // Determine coupons strictly after purchaseIsoDate
  const futureCoupons = allCoupons.filter(
    (c) =>
      c.isoDate > cleanPurchaseIso &&
      (!bond.maturityIsoDate || c.isoDate <= bond.maturityIsoDate)
  );
  const pastCoupons = allCoupons.filter((c) => c.isoDate <= cleanPurchaseIso);

  const prevCouponIso =
    pastCoupons.length > 0
      ? pastCoupons[pastCoupons.length - 1].isoDate
      : issueIso;
  const nextCoupon = futureCoupons.length > 0 ? futureCoupons[0] : null;

  // Compute accrued interest (rateo) at purchaseIsoDate
  let rateoGrossAbs = 0;
  if (nextCoupon && prevCouponIso < nextCoupon.isoDate) {
    const fraction = accrualFraction(
      bond,
      prevCouponIso,
      cleanPurchaseIso,
      nextCoupon.isoDate
    );
    rateoGrossAbs = nextCoupon.gross * fraction;
  }
  const rateoTaxCredit = rateoGrossAbs * (bond.taxRate / 100);
  const principalOutAbs = (bond.settlementPrice / 100) * bond.baseQuantity;

  const parsedIssueIso = italianDateToIso(bond.issueDate);
  const totalDisaggioTax = issuanceDiscountTax(bond);
  const disaggioComputed = Boolean(parsedIssueIso && bond.maturityIsoDate && totalDisaggioTax > 0);
  const disaggioFraction = disaggioComputed
    ? dayCountFraction(
        bond.disaggioConvention || bond.accrualConvention,
        parsedIssueIso,
        cleanPurchaseIso,
        bond.maturityIsoDate
      )
    : 0;
  const disaggioCredit = totalDisaggioTax * disaggioFraction;
  const disaggioDebit = Math.max(0, totalDisaggioTax - disaggioCredit);

  const rebuilt: BondCashflow[] = [
    {
      date: purchaseDateIt,
      isoDate: cleanPurchaseIso,
      description: 'Pagamento nominale',
      amount: -principalOutAbs,
      category: 'principal_out',
    },
  ];

  if (rateoGrossAbs > 0.005) {
    rebuilt.push({
      date: purchaseDateIt,
      isoDate: cleanPurchaseIso,
      description: 'Rateo lordo',
      amount: -rateoGrossAbs,
      category: 'accrued_gross',
    });
    if (rateoTaxCredit > 0.005) {
      rebuilt.push({
        date: purchaseDateIt,
        isoDate: cleanPurchaseIso,
        description: 'Storno tassazione rateo',
        amount: rateoTaxCredit,
        category: 'accrued_tax_credit',
      });
    }
  }

  for (const c of futureCoupons) {
    rebuilt.push({
      date: c.date,
      isoDate: c.isoDate,
      description: 'Incasso cedola lorda',
      amount: c.gross,
      category: 'coupon_gross',
    });
    if (Math.abs(c.tax) > 0.001) {
      rebuilt.push({
        date: c.date,
        isoDate: c.isoDate,
        description: 'Tassazione cedola',
        amount: c.tax,
        category: 'coupon_tax',
      });
    }
  }

  if (disaggioCredit > 0.005) {
    rebuilt.push({
      date: purchaseDateIt,
      isoDate: cleanPurchaseIso,
      description: 'Credito disaggio',
      amount: disaggioCredit,
      category: 'disaggio_credit',
    });
  }

  // Keep maturity flows. Disaggio debit is recomputed for the new purchase date.
  for (const cf of bond.cashflows) {
    if (cf.category === 'principal_in' || cf.category === 'capital_gain_tax') {
      rebuilt.push(cf);
    } else if (cf.category === 'disaggio_debit' && !disaggioComputed) {
      rebuilt.push(cf);
    }
  }

  if (disaggioComputed && disaggioDebit > 0.005 && bond.maturityIsoDate) {
    rebuilt.push({
      date: bond.maturityDate || isoToItalianDate(bond.maturityIsoDate),
      isoDate: bond.maturityIsoDate,
      description: 'Addebito disaggio di emissione',
      amount: -disaggioDebit,
      category: 'disaggio_debit',
    });
  }

  const unitSettlementCcy =
    principalOutAbs + rateoGrossAbs - rateoTaxCredit - disaggioCredit;

  return {
    effectivePurchaseIsoDate: cleanPurchaseIso,
    cashflows: rebuilt,
    unitSettlementCcy,
  };
}

/**
 * Computes annual XIRR (ACT/365) using robust bisection over [-50%, +150%].
 */
export function computeXirrPercent(flows: TimedFlow[]): number {
  if (flows.length < 2) return 0;

  const grouped = new Map<number, number>();
  for (const f of flows) {
    if (Math.abs(f.amount) < 1e-9) continue;
    grouped.set(f.timeMs, (grouped.get(f.timeMs) ?? 0) + f.amount);
  }

  const entries = Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);
  if (entries.length < 2) return 0;

  const t0 = entries[0][0];
  const MS_PER_YEAR = 365 * 86400 * 1000;

  let hasNegative = false;
  let hasPositive = false;
  const normalized = entries.map(([timeMs, amount]) => {
    if (amount < 0) hasNegative = true;
    if (amount > 0) hasPositive = true;
    return { t: (timeMs - t0) / MS_PER_YEAR, amount };
  });

  if (!hasNegative || !hasPositive) return 0;

  const npv = (r: number): number => {
    let sum = 0;
    const base = 1 + r;
    if (base <= 0) return Number.POSITIVE_INFINITY;
    for (const item of normalized) {
      sum += item.amount / Math.pow(base, item.t);
    }
    return sum;
  };

  let low = -0.5;
  let high = 1.5;
  let fLow = npv(low);
  let fHigh = npv(high);

  if (fLow * fHigh > 0) {
    low = -0.85;
    high = 5.0;
    fLow = npv(low);
    fHigh = npv(high);
    if (fLow * fHigh > 0) return 0;
  }

  for (let i = 0; i < 70; i++) {
    const mid = (low + high) / 2;
    const fMid = npv(mid);
    if (Math.abs(fMid) < 1e-7) {
      return mid * 100;
    }
    if ((fLow > 0 && fMid > 0) || (fLow < 0 && fMid < 0)) {
      low = mid;
      fLow = fMid;
    } else {
      high = mid;
      fHigh = fMid;
    }
  }

  return ((low + high) / 2) * 100;
}

export function calculateCommissionEur(
  orderCountervalueEur: number,
  settings: PortfolioSettings
): number {
  if (orderCountervalueEur <= 0 || settings.commissionPercent <= 0) return 0;
  return orderCountervalueEur * (settings.commissionPercent / 100);
}

/**
 * Helper to preview the exact EUR cost of purchasing a specific nominal amount of a bond.
 */
export function calculateNominalPurchaseCost(
  holding: PortfolioHolding,
  nominalCcy: number,
  settings: PortfolioSettings
): {
  cleanPrincipalEur: number;
  settlementOutlayEur: number;
  commissionEur: number;
  totalCostEur: number;
} {
  const { bond } = holding;
  const fxUnitsPerEur = unitsPerEur(bond.currency, settings.fxRates);
  const toEur = (amt: number) => toEurAmount(amt, fxUnitsPerEur);

  const { unitSettlementCcy } = buildCashflowsForPurchaseDate(
    bond,
    holding.purchaseIsoDate || bond.settlementIsoDate
  );

  const scaleFactor = bond.baseQuantity > 0 ? nominalCcy / bond.baseQuantity : 0;
  const cleanPrincipalEur = toEur((bond.settlementPrice / 100) * nominalCcy);
  const settlementOutlayEur = toEur(unitSettlementCcy * scaleFactor);
  const commissionEur =
    nominalCcy > 0 ? calculateCommissionEur(settlementOutlayEur, settings) : 0;

  return {
    cleanPrincipalEur,
    settlementOutlayEur,
    commissionEur,
    totalCostEur: settlementOutlayEur + commissionEur,
  };
}

export function calculatePortfolioAnalytics(
  holdings: PortfolioHolding[],
  settings: PortfolioSettings
): PortfolioAnalytics {
  const totalAllocatedWeightPercent = holdings.reduce(
    (sum, h) => sum + Math.max(0, h.weightPercent),
    0
  );

  const normalizationDenom =
    totalAllocatedWeightPercent > 0 ? totalAllocatedWeightPercent : 100;

  const grossIrrFlows: TimedFlow[] = [];
  const netIrrFlows: TimedFlow[] = [];
  const realNetIrrFlows: TimedFlow[] = [];

  const cashflowLedger: ScaledCashflowEvent[] = [];
  const holdingCalcs: HoldingCalculation[] = [];

  let totalInvestedExclCommEur = 0;
  let totalCommissionsEur = 0;
  let totalGrossCouponsEur = 0;
  let totalCouponTaxesEur = 0;
  let totalNetCouponsEur = 0;
  let totalRedemptionEur = 0;
  let totalCapitalGainAndDisaggioTaxEur = 0;
  let totalEstimatedBolloEur = 0;

  let weightedGrossYieldSum = 0;
  let weightedNetYieldSum = 0;
  let weightedGrossDurationSum = 0;
  let weightedNetDurationSum = 0;
  let weightedMaturityYearsSum = 0;

  let rate125Eur = 0;
  let rate26Eur = 0;
  let otherTaxEur = 0;
  const taxRateMap = new Map<number, number>();

  const bucketMap = {
    short: 0,
    medium: 0,
    long: 0,
    ultra: 0,
  };

  const bolloByYear = new Map<number, number>();
  let earliestPurchaseMs = Number.POSITIVE_INFINITY;

  for (const holding of holdings) {
    const { bond } = holding;
    const fxUnitsPerEur = unitsPerEur(bond.currency, settings.fxRates);
    const toEur = (amtInBondCcy: number) => toEurAmount(amtInBondCcy, fxUnitsPerEur);

    const { effectivePurchaseIsoDate, cashflows, unitSettlementCcy } =
      buildCashflowsForPurchaseDate(
        bond,
        holding.purchaseIsoDate || bond.settlementIsoDate
      );

    const normalizedShare =
      totalAllocatedWeightPercent > 0
        ? Math.max(0, holding.weightPercent) / normalizationDenom
        : 0;
    const targetCapitalEur = settings.totalCapital * normalizedShare;
    const targetCapitalBondCcy = targetCapitalEur * fxUnitsPerEur;

    let nominalAmountCcy = 0;
    if (
      typeof holding.manualNominalCcy === 'number' &&
      holding.manualNominalCcy >= 0
    ) {
      nominalAmountCcy = holding.manualNominalCcy;
    } else {
      const rawNominalCcy =
        unitSettlementCcy > 0
          ? (targetCapitalBondCcy / unitSettlementCcy) * bond.baseQuantity
          : 0;
      const minLot = Math.max(1, bond.minLot || 1000);
      nominalAmountCcy = settings.roundToMinLot
        ? Math.floor(rawNominalCcy / minLot) * minLot
        : rawNominalCcy;
    }

    const scaleFactor =
      bond.baseQuantity > 0 ? nominalAmountCcy / bond.baseQuantity : 0;
    const nominalAmountEur = toEur(nominalAmountCcy);

    let cleanPrincipalEur = 0;
    let accruedNetEur = 0;
    let holdingGrossCouponsEur = 0;
    let holdingCouponTaxesEur = 0;
    let holdingRedemptionEur = 0;
    let holdingCgAndDisaggioTaxEur = 0;

    const purchaseMs = isoToTimeMs(effectivePurchaseIsoDate);
    if (purchaseMs < earliestPurchaseMs) {
      earliestPurchaseMs = purchaseMs;
    }
    const maturityMs = isoToTimeMs(bond.maturityIsoDate);
    const yearsToMaturity = Math.max(
      0.05,
      (maturityMs - purchaseMs) / (365.25 * 86400 * 1000)
    );

    const holdingRealFlows: TimedFlow[] = [];

    for (const cf of cashflows) {
      // Source pages often include a zero (or page-level) commission line.
      // Broker fees are applied once, from the user's commission setting.
      if (cf.category === 'commission_out') continue;

      const scaledEur = toEur(cf.amount * scaleFactor);
      const timeMs = isoToTimeMs(cf.isoDate);
      const [yearStr, monthStr] = cf.isoDate.split('-');
      const year = Number.parseInt(yearStr, 10) || 2026;
      const month = Number.parseInt(monthStr, 10) || 1;

      if (Math.abs(scaledEur) > 0.001) {
        cashflowLedger.push({
          isoDate: cf.isoDate,
          date: cf.date,
          year,
          month,
          bondId: bond.bondId,
          isin: bond.isin,
          bondDescription: bond.description,
          color: holding.color,
          description: cf.description,
          category: cf.category,
          amountEur: scaledEur,
        });
      }

      switch (cf.category) {
        case 'principal_out':
          cleanPrincipalEur += Math.abs(scaledEur);
          grossIrrFlows.push({ timeMs, amount: scaledEur });
          netIrrFlows.push({ timeMs, amount: scaledEur });
          realNetIrrFlows.push({ timeMs, amount: scaledEur });
          holdingRealFlows.push({ timeMs, amount: scaledEur });
          break;
        case 'accrued_gross':
          accruedNetEur += Math.abs(scaledEur);
          grossIrrFlows.push({ timeMs, amount: scaledEur });
          netIrrFlows.push({ timeMs, amount: scaledEur });
          realNetIrrFlows.push({ timeMs, amount: scaledEur });
          holdingRealFlows.push({ timeMs, amount: scaledEur });
          break;
        case 'accrued_tax_credit':
        case 'disaggio_credit':
          accruedNetEur -= scaledEur;
          netIrrFlows.push({ timeMs, amount: scaledEur });
          realNetIrrFlows.push({ timeMs, amount: scaledEur });
          holdingRealFlows.push({ timeMs, amount: scaledEur });
          break;
        case 'coupon_gross':
          holdingGrossCouponsEur += scaledEur;
          grossIrrFlows.push({ timeMs, amount: scaledEur });
          netIrrFlows.push({ timeMs, amount: scaledEur });
          realNetIrrFlows.push({ timeMs, amount: scaledEur });
          holdingRealFlows.push({ timeMs, amount: scaledEur });
          break;
        case 'coupon_tax':
          holdingCouponTaxesEur += Math.abs(scaledEur);
          netIrrFlows.push({ timeMs, amount: scaledEur });
          realNetIrrFlows.push({ timeMs, amount: scaledEur });
          holdingRealFlows.push({ timeMs, amount: scaledEur });
          break;
        case 'principal_in':
          holdingRedemptionEur += scaledEur;
          grossIrrFlows.push({ timeMs, amount: scaledEur });
          netIrrFlows.push({ timeMs, amount: scaledEur });
          realNetIrrFlows.push({ timeMs, amount: scaledEur });
          holdingRealFlows.push({ timeMs, amount: scaledEur });
          break;
        case 'disaggio_debit':
        case 'capital_gain_tax':
          holdingCgAndDisaggioTaxEur += Math.abs(scaledEur);
          netIrrFlows.push({ timeMs, amount: scaledEur });
          realNetIrrFlows.push({ timeMs, amount: scaledEur });
          holdingRealFlows.push({ timeMs, amount: scaledEur });
          break;
        default:
          netIrrFlows.push({ timeMs, amount: scaledEur });
          realNetIrrFlows.push({ timeMs, amount: scaledEur });
          holdingRealFlows.push({ timeMs, amount: scaledEur });
          break;
      }
    }

    const settlementOutlayEur = toEur(unitSettlementCcy * scaleFactor);
    const commissionEur =
      nominalAmountCcy > 0 ? calculateCommissionEur(settlementOutlayEur, settings) : 0;

    if (commissionEur > 0) {
      realNetIrrFlows.push({ timeMs: purchaseMs, amount: -commissionEur });
      holdingRealFlows.push({ timeMs: purchaseMs, amount: -commissionEur });
      const [sYear, sMonth] = effectivePurchaseIsoDate.split('-');
      cashflowLedger.push({
        isoDate: effectivePurchaseIsoDate,
        date: isoToItalianDate(effectivePurchaseIsoDate),
        year: Number.parseInt(sYear, 10) || 2026,
        month: Number.parseInt(sMonth, 10) || 11,
        bondId: bond.bondId,
        isin: bond.isin,
        bondDescription: bond.description,
        color: holding.color,
        description: 'Commissioni broker stimate',
        category: 'commission_out',
        amountEur: -commissionEur,
      });
    }

    // Annual Imposta di Bollo (0.20% per annum on market value)
    let holdingBolloEur = 0;
    if (
      settings.includeBollo &&
      settlementOutlayEur > 0 &&
      !isTitoloDiStato(bond.description, bond.isin)
    ) {
      const startYear =
        Number.parseInt(effectivePurchaseIsoDate.slice(0, 4), 10) || 2026;
      const endYear =
        Number.parseInt(bond.maturityIsoDate.slice(0, 4), 10) || startYear;
      const bolloBaseEur = (bond.settlementPrice / 100) * nominalAmountEur;
      const bolloRate = settings.bolloRatePercent / 100;

      for (let yr = startYear; yr <= endYear; yr++) {
        const yrStartMs = Date.UTC(yr, 0, 1);
        const yrEndMs = Date.UTC(yr, 11, 31);
        const effStart = Math.max(purchaseMs, yrStartMs);
        const effEnd = Math.min(maturityMs, yrEndMs);
        if (effEnd <= effStart) continue;
        const fraction = (effEnd - effStart) / (365 * 86400 * 1000);
        const yearBollo = bolloBaseEur * bolloRate * Math.min(1, fraction);
        holdingBolloEur += yearBollo;
        bolloByYear.set(yr, (bolloByYear.get(yr) ?? 0) + yearBollo);
        realNetIrrFlows.push({ timeMs: effEnd, amount: -yearBollo });
        holdingRealFlows.push({ timeMs: effEnd, amount: -yearBollo });
      }
    }

    const totalInitialCostEur = settlementOutlayEur + commissionEur;
    const holdingNetCouponsEur = holdingGrossCouponsEur - holdingCouponTaxesEur;
    const netGainAtMaturityEur =
      holdingNetCouponsEur +
      holdingRedemptionEur -
      holdingCgAndDisaggioTaxEur -
      holdingBolloEur -
      totalInitialCostEur;

    const annualGrossCouponEur = holdingGrossCouponsEur / yearsToMaturity;
    const annualNetCouponEur = holdingNetCouponsEur / yearsToMaturity;
    const effectiveNetYieldAfterFees = computeXirrPercent(holdingRealFlows);

    totalInvestedExclCommEur += settlementOutlayEur;
    totalCommissionsEur += commissionEur;
    totalGrossCouponsEur += holdingGrossCouponsEur;
    totalCouponTaxesEur += holdingCouponTaxesEur;
    totalNetCouponsEur += holdingNetCouponsEur;
    totalRedemptionEur += holdingRedemptionEur;
    totalCapitalGainAndDisaggioTaxEur += holdingCgAndDisaggioTaxEur;
    totalEstimatedBolloEur += holdingBolloEur;

    weightedGrossYieldSum += bond.grossYield * settlementOutlayEur;
    weightedNetYieldSum += bond.netYield * settlementOutlayEur;
    weightedGrossDurationSum += bond.grossDuration * settlementOutlayEur;
    weightedNetDurationSum += bond.netDuration * settlementOutlayEur;
    weightedMaturityYearsSum += yearsToMaturity * settlementOutlayEur;

    const roundedRate = Math.round(bond.taxRate * 100) / 100;
    taxRateMap.set(
      roundedRate,
      (taxRateMap.get(roundedRate) ?? 0) + settlementOutlayEur
    );

    if (Math.abs(bond.taxRate - 12.5) < 0.1) {
      rate125Eur += settlementOutlayEur;
    } else if (Math.abs(bond.taxRate - 26) < 0.1) {
      rate26Eur += settlementOutlayEur;
    } else {
      otherTaxEur += settlementOutlayEur;
    }

    if (yearsToMaturity <= 3) bucketMap.short += settlementOutlayEur;
    else if (yearsToMaturity <= 7) bucketMap.medium += settlementOutlayEur;
    else if (yearsToMaturity <= 15) bucketMap.long += settlementOutlayEur;
    else bucketMap.ultra += settlementOutlayEur;

    holdingCalcs.push({
      holding,
      effectivePurchaseIsoDate,
      targetCapitalEur,
      effectiveWeightPercent: 0,
      nominalAmountCcy,
      nominalAmountEur,
      scaleFactor,
      cleanPrincipalEur,
      accruedNetEur,
      settlementOutlayEur,
      commissionEur,
      totalInitialCostEur,
      grossCouponsTotalEur: holdingGrossCouponsEur,
      couponTaxesTotalEur: holdingCouponTaxesEur,
      netCouponsTotalEur: holdingNetCouponsEur,
      redemptionProceedsEur: holdingRedemptionEur,
      capitalGainAndDisaggioTaxEur: holdingCgAndDisaggioTaxEur,
      estimatedBolloTotalEur: holdingBolloEur,
      netGainAtMaturityEur,
      annualNetCouponEur,
      annualGrossCouponEur,
      yearsToMaturity,
      effectiveNetYieldAfterFees,
    });
  }

  const totalInitialOutlayEur = totalInvestedExclCommEur + totalCommissionsEur;
  const uninvestedCashEur = Math.max(0, settings.totalCapital - totalInitialOutlayEur);

  for (const hc of holdingCalcs) {
    hc.effectiveWeightPercent =
      totalInvestedExclCommEur > 0
        ? (hc.settlementOutlayEur / totalInvestedExclCommEur) * 100
        : 0;
  }

  // Annual Schedule aggregation
  const annualMap = new Map<
    number,
    {
      grossCouponsEur: number;
      couponTaxesEur: number;
      principalRepaidEur: number;
      otherTaxesEur: number;
      bolloEur: number;
    }
  >();

  for (const ev of cashflowLedger) {
    const yr = ev.year;
    if (!annualMap.has(yr)) {
      annualMap.set(yr, {
        grossCouponsEur: 0,
        couponTaxesEur: 0,
        principalRepaidEur: 0,
        otherTaxesEur: 0,
        bolloEur: bolloByYear.get(yr) ?? 0,
      });
    }
    const row = annualMap.get(yr)!;
    if (ev.category === 'coupon_gross') {
      row.grossCouponsEur += ev.amountEur;
    } else if (ev.category === 'coupon_tax') {
      row.couponTaxesEur += Math.abs(ev.amountEur);
    } else if (ev.category === 'principal_in') {
      row.principalRepaidEur += ev.amountEur;
    } else if (
      ev.category === 'capital_gain_tax' ||
      ev.category === 'disaggio_debit'
    ) {
      row.otherTaxesEur += Math.abs(ev.amountEur);
    }
  }

  for (const [yr, bollo] of bolloByYear) {
    if (annualMap.has(yr)) continue;
    annualMap.set(yr, {
      grossCouponsEur: 0,
      couponTaxesEur: 0,
      principalRepaidEur: 0,
      otherTaxesEur: 0,
      bolloEur: bollo,
    });
  }

  const sortedYears = Array.from(annualMap.keys()).sort((a, b) => a - b);
  let runningNetCum = -totalInitialOutlayEur;
  const annualSchedule: AnnualScheduleRow[] = sortedYears.map((yr) => {
    const r = annualMap.get(yr)!;
    const netCouponsEur = r.grossCouponsEur - r.couponTaxesEur;
    const totalNetInflowEur =
      netCouponsEur + r.principalRepaidEur - r.otherTaxesEur - r.bolloEur;
    runningNetCum += totalNetInflowEur;
    return {
      year: yr,
      grossCouponsEur: r.grossCouponsEur,
      couponTaxesEur: r.couponTaxesEur,
      netCouponsEur,
      principalRepaidEur: r.principalRepaidEur,
      otherTaxesEur: r.otherTaxesEur,
      bolloEur: r.bolloEur,
      totalNetInflowEur,
      cumulativeNetFlowEur: runningNetCum,
    };
  });

  // 12-Month Coupon Seasonality starting from earliest purchase date
  const refStartMs = Number.isFinite(earliestPurchaseMs)
    ? earliestPurchaseMs
    : Date.now();
  const oneYearLaterMs = refStartMs + 365.25 * 86400 * 1000;

  const monthlySeasonality: MonthlySeasonalityRow[] = Array.from(
    { length: 12 },
    (_, idx) => ({
      monthIndex: idx + 1,
      monthLabel: ITALIAN_MONTHS_SHORT[idx],
      next12MonthsNetEur: 0,
      next12MonthsGrossEur: 0,
      totalLifetimeNetEur: 0,
      couponCount: 0,
    })
  );

  for (const ev of cashflowLedger) {
    if (ev.category !== 'coupon_gross' && ev.category !== 'coupon_tax') continue;
    const bucket = monthlySeasonality[ev.month - 1];
    if (!bucket) continue;
    const evMs = isoToTimeMs(ev.isoDate);

    if (ev.category === 'coupon_gross') {
      bucket.totalLifetimeNetEur += ev.amountEur;
      bucket.couponCount += 1;
      if (evMs >= refStartMs && evMs <= oneYearLaterMs) {
        bucket.next12MonthsGrossEur += ev.amountEur;
        bucket.next12MonthsNetEur += ev.amountEur;
      }
    } else if (ev.category === 'coupon_tax') {
      bucket.totalLifetimeNetEur += ev.amountEur;
      if (evMs >= refStartMs && evMs <= oneYearLaterMs) {
        bucket.next12MonthsNetEur += ev.amountEur;
      }
    }
  }

  cashflowLedger.sort((a, b) => a.isoDate.localeCompare(b.isoDate));

  const weightedGrossYieldPercent =
    totalInvestedExclCommEur > 0
      ? weightedGrossYieldSum / totalInvestedExclCommEur
      : 0;
  const weightedNetYieldPercent =
    totalInvestedExclCommEur > 0
      ? weightedNetYieldSum / totalInvestedExclCommEur
      : 0;
  const weightedGrossDuration =
    totalInvestedExclCommEur > 0
      ? weightedGrossDurationSum / totalInvestedExclCommEur
      : 0;
  const weightedNetDuration =
    totalInvestedExclCommEur > 0
      ? weightedNetDurationSum / totalInvestedExclCommEur
      : 0;
  const weightedAvgMaturityYears =
    totalInvestedExclCommEur > 0
      ? weightedMaturityYearsSum / totalInvestedExclCommEur
      : 0;

  const portfolioGrossIrrPercent = computeXirrPercent(grossIrrFlows);
  const portfolioNetIrrPercent = computeXirrPercent(netIrrFlows);
  const portfolioRealNetIrrPercent = computeXirrPercent(realNetIrrFlows);

  const annualGrossCouponEur = holdingCalcs.reduce(
    (s, h) => s + h.annualGrossCouponEur,
    0
  );
  const annualNetCouponEur = holdingCalcs.reduce(
    (s, h) => s + h.annualNetCouponEur,
    0
  );

  const totalAllCostsAndTaxesEur =
    totalCommissionsEur +
    totalCouponTaxesEur +
    totalCapitalGainAndDisaggioTaxEur +
    totalEstimatedBolloEur;

  const totalNetProfitAtMaturityEur =
    totalNetCouponsEur +
    totalRedemptionEur -
    totalCapitalGainAndDisaggioTaxEur -
    totalEstimatedBolloEur -
    totalInitialOutlayEur;

  const totalFinalValueEur = totalInitialOutlayEur + totalNetProfitAtMaturityEur;

  const maturityDenom = totalInvestedExclCommEur > 0 ? totalInvestedExclCommEur : 1;
  const maturityBuckets = [
    {
      label: 'Breve (≤ 3 anni)',
      amountEur: bucketMap.short,
      percent: (bucketMap.short / maturityDenom) * 100,
    },
    {
      label: 'Medio (3–7 anni)',
      amountEur: bucketMap.medium,
      percent: (bucketMap.medium / maturityDenom) * 100,
    },
    {
      label: 'Lungo (7–15 anni)',
      amountEur: bucketMap.long,
      percent: (bucketMap.long / maturityDenom) * 100,
    },
    {
      label: 'Extra Lungo (> 15 anni)',
      amountEur: bucketMap.ultra,
      percent: (bucketMap.ultra / maturityDenom) * 100,
    },
  ];

  const taxRatesBreakdown = Array.from(taxRateMap.entries())
    .filter(([, amountEur]) => amountEur > 0)
    .map(([rate, amountEur]) => ({
      rate,
      amountEur,
      percent: (amountEur / maturityDenom) * 100,
    }))
    .sort((a, b) => a.rate - b.rate);

  return {
    totalCapitalTargetEur: settings.totalCapital,
    totalAllocatedWeightPercent,
    totalInvestedExclCommEur,
    totalCommissionsEur,
    totalInitialOutlayEur,
    uninvestedCashEur,

    weightedGrossYieldPercent,
    weightedNetYieldPercent,
    portfolioGrossIrrPercent,
    portfolioNetIrrPercent,
    portfolioRealNetIrrPercent,
    weightedGrossDuration,
    weightedNetDuration,
    weightedAvgMaturityYears,

    annualGrossCouponEur,
    annualNetCouponEur,
    monthlyAvgNetCouponEur: annualNetCouponEur / 12,
    totalGrossCouponsEur,
    totalCouponTaxesEur,
    totalNetCouponsEur,
    totalRedemptionEur,
    totalCapitalGainAndDisaggioTaxEur,
    totalEstimatedBolloEur,
    totalAllCostsAndTaxesEur,
    annualCostDragPercent: Math.max(
      0,
      portfolioGrossIrrPercent - portfolioRealNetIrrPercent
    ),
    totalNetProfitAtMaturityEur,
    totalFinalValueEur,

    holdings: holdingCalcs,
    annualSchedule,
    monthlySeasonality,
    cashflowLedger,
    taxBucketBreakdown: {
      rate125Eur,
      rate26Eur,
      otherEur: otherTaxEur,
    },
    taxRatesBreakdown,
    maturityBuckets,
  };
}
