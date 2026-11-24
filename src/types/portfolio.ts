export type CashflowCategory =
  | 'principal_out'
  | 'commission_out'
  | 'accrued_gross'
  | 'accrued_tax_credit'
  | 'disaggio_credit'
  | 'coupon_gross'
  | 'coupon_tax'
  | 'principal_in'
  | 'disaggio_debit'
  | 'capital_gain_tax'
  | 'other';

export interface BondCashflow {
  date: string; // DD/MM/YYYY
  isoDate: string; // YYYY-MM-DD
  description: string;
  amount: number; // Base quantity amount in emission currency
  category: CashflowCategory;
}

export interface CouponScheduleItem {
  date: string; // DD/MM/YYYY
  isoDate: string; // YYYY-MM-DD
  formula: string;
  ratePercent: number;
}

export interface BondData {
  bondId: string;
  marketCode: string;
  sourceUrl: string;
  fetchedAt: string;

  // Dati operazione
  settlementDate: string; // DD/MM/YYYY
  settlementIsoDate: string; // YYYY-MM-DD
  settlementPrice: number;
  baseQuantity: number;
  baseCommissions: number;

  // Dati obbligazione
  bondType: string;
  isin: string;
  description: string;
  currency: string;
  minLot: number;
  issueDate: string;
  issuePrice: number;
  maturityDate: string;
  maturityIsoDate: string;
  redemptionPrice: number;
  couponRate: number | null;
  couponFrequency: string;
  accrualConvention: string;
  disaggioConvention: string;
  taxRate: number; // e.g., 12.5 or 26

  // Rendimenti e durate
  grossYield: number; // %
  netYield: number; // %
  netYieldNoCg: number; // %
  grossDuration: number;
  netDuration: number;

  // Dati calcolati (per baseQuantity)
  iSpread: number | null;
  zSpread: number | null;
  capitalGainTaxBase: number;
  settlementCountervalueBase: number;
  totalCashflowBalanceBase: number;

  // Piano cedolare & Flussi di cassa
  couponSchedule: CouponScheduleItem[];
  cashflows: BondCashflow[];
}

export interface PortfolioHolding {
  id: string;
  bond: BondData;
  weightPercent: number;
  color: string;
  purchaseIsoDate?: string; // YYYY-MM-DD; defaults to bond.settlementIsoDate
  manualNominalCcy?: number | null; // explicit nominal override when user edits nominal directly
}

export interface PortfolioSettings {
  totalCapital: number;
  commissionPercent: number; // percent of order value, e.g. 0.19 means 0.19%
  includeBollo: boolean; // 0.20% annual stamp duty
  bolloRatePercent: number; // default 0.20
  roundToMinLot: boolean;
  fxRates: Record<string, number>; // units of foreign currency per 1 EUR, from the ECB reference rate
}

export interface SavedPortfolio {
  id: string;
  name: string;
  updatedAt: string;
  holdings: PortfolioHolding[];
  settings: PortfolioSettings;
  autoRebalance100: boolean;
}

export interface ScaledCashflowEvent {
  isoDate: string;
  date: string;
  year: number;
  month: number; // 1-12
  bondId: string;
  isin: string;
  bondDescription: string;
  color: string;
  description: string;
  category: CashflowCategory;
  amountEur: number;
}

export interface HoldingCalculation {
  holding: PortfolioHolding;
  effectivePurchaseIsoDate: string;
  targetCapitalEur: number;
  effectiveWeightPercent: number;
  nominalAmountCcy: number;
  nominalAmountEur: number;
  scaleFactor: number;
  cleanPrincipalEur: number;
  accruedNetEur: number; // rateo lordo + storno rateo + credito disaggio
  settlementOutlayEur: number; // actual cash paid for bond (excl. commission)
  commissionEur: number;
  totalInitialCostEur: number; // settlementOutlayEur + commissionEur
  grossCouponsTotalEur: number;
  couponTaxesTotalEur: number; // positive magnitude of taxes paid
  netCouponsTotalEur: number;
  redemptionProceedsEur: number;
  capitalGainAndDisaggioTaxEur: number; // positive magnitude
  estimatedBolloTotalEur: number;
  netGainAtMaturityEur: number;
  annualNetCouponEur: number;
  annualGrossCouponEur: number;
  yearsToMaturity: number;
  effectiveNetYieldAfterFees: number;
}

export interface AnnualScheduleRow {
  year: number;
  grossCouponsEur: number;
  couponTaxesEur: number;
  netCouponsEur: number;
  principalRepaidEur: number;
  otherTaxesEur: number; // CG + disaggio + bollo
  bolloEur: number;
  totalNetInflowEur: number;
  cumulativeNetFlowEur: number;
}

export interface MonthlySeasonalityRow {
  monthIndex: number; // 1-12
  monthLabel: string;
  next12MonthsNetEur: number;
  next12MonthsGrossEur: number;
  totalLifetimeNetEur: number;
  couponCount: number;
}

export interface PortfolioAnalytics {
  totalCapitalTargetEur: number;
  totalAllocatedWeightPercent: number;
  totalInvestedExclCommEur: number;
  totalCommissionsEur: number;
  totalInitialOutlayEur: number;
  uninvestedCashEur: number;

  // Yields & Duration
  weightedGrossYieldPercent: number;
  weightedNetYieldPercent: number;
  portfolioGrossIrrPercent: number;
  portfolioNetIrrPercent: number; // net of bond taxes
  portfolioRealNetIrrPercent: number; // net of bond taxes + broker commissions + bollo
  weightedGrossDuration: number;
  weightedNetDuration: number;
  weightedAvgMaturityYears: number;

  // Cash & Income Summary
  annualGrossCouponEur: number;
  annualNetCouponEur: number;
  monthlyAvgNetCouponEur: number;
  totalGrossCouponsEur: number;
  totalCouponTaxesEur: number;
  totalNetCouponsEur: number;
  totalRedemptionEur: number;
  totalCapitalGainAndDisaggioTaxEur: number;
  totalEstimatedBolloEur: number;
  totalAllCostsAndTaxesEur: number;
  annualCostDragPercent: number;
  totalNetProfitAtMaturityEur: number;
  totalFinalValueEur: number;

  // Breakdowns
  holdings: HoldingCalculation[];
  annualSchedule: AnnualScheduleRow[];
  monthlySeasonality: MonthlySeasonalityRow[];
  cashflowLedger: ScaledCashflowEvent[];
  taxBucketBreakdown: {
    rate125Eur: number;
    rate26Eur: number;
    otherEur: number;
  };
  taxRatesBreakdown: {
    rate: number;
    amountEur: number;
    percent: number;
  }[];
  maturityBuckets: {
    label: string;
    amountEur: number;
    percent: number;
  }[];
}
