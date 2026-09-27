export type FinancialHealthInput = {
  currentSavings: number | null;
  target: number | null;
  horizonMonths: number | null;
  monthlyContribution: number | null;
  cash: number | null;
  monthlyIncome: number | null;
  monthlyExpenses: number | null;
  debtBalance: number | null;
  monthlyDebtPayments: number | null;
  investments: number | null;
  property: number | null;
  vehicles: number | null;
  otherAssets: number | null;
  expectedReturnPercent: number;
  volatilityPercent: number;
};

export type FinancialHealthSnapshot = {
  netWorth: number | null;
  netWorthIsPartial: boolean;
  monthlyMargin: number | null;
  runwayMonths: number | null;
  goalProgressPercent: number | null;
  requiredMonthlyContribution: number | null;
  projectedValue: number | null;
  confidencePercent: number;
  completenessPercent: number;
  knownFields: number;
  totalFields: number;
};

function known(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

function nonNegative(value: number | null | undefined): number {
  return known(value) ? Math.max(0, value) : 0;
}

export function monthlyRateFromAnnual(
  annualReturnPercent: number,
): number {
  const annual = Math.max(-99, annualReturnPercent) / 100;
  return (1 + annual) ** (1 / 12) - 1;
}

export function projectedFutureValue(
  initial: number,
  monthly: number,
  months: number,
  annualReturnPercent: number,
): number {
  const safeMonths = Math.max(0, Math.round(months));
  const rate = monthlyRateFromAnnual(annualReturnPercent);
  if (Math.abs(rate) < 1e-10) {
    return initial + monthly * safeMonths;
  }
  const growth = (1 + rate) ** safeMonths;
  return initial * growth + monthly * ((growth - 1) / rate);
}

export function requiredMonthlyContribution(
  initial: number,
  target: number,
  months: number,
  annualReturnPercent: number,
): number | null {
  const safeMonths = Math.max(0, Math.round(months));
  if (target <= initial) return 0;
  if (safeMonths <= 0) return null;
  const rate = monthlyRateFromAnnual(annualReturnPercent);
  if (Math.abs(rate) < 1e-10) {
    return Math.max(0, (target - initial) / safeMonths);
  }
  const growth = (1 + rate) ** safeMonths;
  const denominator = (growth - 1) / rate;
  if (denominator <= 0) return null;
  return Math.max(0, (target - initial * growth) / denominator);
}

export function computeFinancialHealth(
  input: FinancialHealthInput,
): FinancialHealthSnapshot {
  const assetFields = [
    input.cash,
    input.investments,
    input.property,
    input.vehicles,
    input.otherAssets,
  ];
  const knownAssetFields = assetFields.filter(known).length;
  const knownDebt = known(input.debtBalance);
  const netWorth =
    knownAssetFields > 0 || knownDebt
      ? assetFields.reduce<number>(
          (sum, value) => sum + (known(value) ? value : 0),
          0,
        ) - nonNegative(input.debtBalance)
      : null;
  const netWorthIsPartial =
    netWorth != null &&
    (
      knownAssetFields < assetFields.length ||
      !knownDebt
    );

  const monthlyIncome = known(input.monthlyIncome)
    ? input.monthlyIncome
    : null;
  const monthlyExpenses = known(input.monthlyExpenses)
    ? input.monthlyExpenses
    : null;
  const monthlyDebtPayments = known(input.monthlyDebtPayments)
    ? input.monthlyDebtPayments
    : null;
  const monthlyContribution = known(input.monthlyContribution)
    ? input.monthlyContribution
    : null;
  const cash = known(input.cash) ? input.cash : null;
  const currentSavings = known(input.currentSavings)
    ? input.currentSavings
    : null;
  const target =
    known(input.target) && input.target > 0
      ? input.target
      : null;
  const horizonMonths =
    known(input.horizonMonths) && input.horizonMonths > 0
      ? input.horizonMonths
      : null;

  const incomeKnown = monthlyIncome != null;
  const expensesKnown = monthlyExpenses != null;

  const monthlyMargin =
    monthlyIncome != null && monthlyExpenses != null
      ? monthlyIncome -
        monthlyExpenses -
        nonNegative(monthlyDebtPayments) -
        nonNegative(monthlyContribution)
      : null;

  const monthlyOutflow =
    monthlyExpenses != null
      ? Math.max(
          0,
          monthlyExpenses +
            nonNegative(monthlyDebtPayments),
        )
      : null;

  const runwayMonths =
    cash != null &&
    monthlyOutflow != null &&
    monthlyOutflow > 0
      ? Math.max(0, cash / monthlyOutflow)
      : null;

  const hasGoal =
    target != null &&
    currentSavings != null;
  const goalProgressPercent =
    target != null && currentSavings != null
      ? Math.max(
          0,
          Math.min(
            999,
            (currentSavings / target) * 100,
          ),
        )
      : null;

  const projectedValue =
    target != null &&
    currentSavings != null &&
    horizonMonths != null
      ? projectedFutureValue(
          currentSavings,
          nonNegative(monthlyContribution),
          horizonMonths,
          input.expectedReturnPercent,
        )
      : null;

  const requiredContribution =
    target != null &&
    currentSavings != null &&
    horizonMonths != null
      ? requiredMonthlyContribution(
          currentSavings,
          target,
          horizonMonths,
          input.expectedReturnPercent,
        )
      : null;

  const completenessFields: Array<number | null> = [
    input.currentSavings,
    input.target,
    input.horizonMonths,
    input.monthlyContribution,
    input.cash,
    input.monthlyIncome,
    input.monthlyExpenses,
    input.debtBalance,
    input.monthlyDebtPayments,
    input.investments,
    input.property,
    input.vehicles,
    input.otherAssets,
  ];
  const knownFields = completenessFields.filter(known).length;
  const totalFields = completenessFields.length;
  const completenessPercent = Math.round(
    (knownFields / totalFields) * 100,
  );

  const freshnessNeutralConfidence =
    completenessPercent * 0.72 +
    (hasGoal ? 12 : 0) +
    (incomeKnown && expensesKnown ? 10 : 0) +
    (cash != null ? 6 : 0);
  const confidencePercent = Math.round(
    Math.max(0, Math.min(100, freshnessNeutralConfidence)),
  );

  return {
    netWorth,
    netWorthIsPartial,
    monthlyMargin,
    runwayMonths,
    goalProgressPercent,
    requiredMonthlyContribution: requiredContribution,
    projectedValue,
    confidencePercent,
    completenessPercent,
    knownFields,
    totalFields,
  };
}
