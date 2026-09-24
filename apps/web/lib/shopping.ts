export type ShoppingCategoryId =
  | "credit_card"
  | "banking"
  | "mortgage"
  | "student_loan"
  | "personal_loan"
  | "auto_insurance"
  | "life_insurance"
  | "tax";

export type ShoppingPriority =
  | "lowest_cost"
  | "lowest_rate"
  | "rewards"
  | "flexibility"
  | "coverage"
  | "simplicity";

export type ShoppingSource = {
  id: string;
  category: ShoppingCategoryId;
  nameFr: string;
  nameEn: string;
  descriptionFr: string;
  descriptionEn: string;
  urlFr: string;
  urlEn: string;
  official: boolean;
  kind: "comparison" | "guide" | "calculator" | "registry";
};

export type ShoppingProfile = {
  province: string;
  priority: ShoppingPriority;
  monthlyCardSpend: number;
  carriedCardBalance: number;
  averageBankBalance: number;
  monthlyTransactions: number;
  loanAmount: number;
  amortizationYears: number;
  desiredCoverage: number;
  taxSelfEmployed: boolean;
  taxForeignAssets: boolean;
  taxQuebecReturn: boolean;
};

export type ShoppingOfferMetrics = {
  annualFee?: number | null;
  purchaseRatePercent?: number | null;
  rewardRatePercent?: number | null;
  welcomeValue?: number | null;

  monthlyFee?: number | null;
  includedTransactions?: number | null;
  transactionFee?: number | null;
  savingsRatePercent?: number | null;
  eTransfersIncluded?: boolean | null;

  interestRatePercent?: number | null;
  rateType?: "fixed" | "variable" | "other" | null;
  upfrontFees?: number | null;
  termMonths?: number | null;

  annualPremium?: number | null;
  deductible?: number | null;
  coverageAmount?: number | null;

  taxPrice?: number | null;
  taxCostMode?: "free" | "free_optional_paid" | "paid_free_eligible" | "paid" | "unknown" | null;
  supportsQuebec?: boolean | null;
  supportsSelfEmployed?: boolean | null;
  supportsForeignAssets?: boolean | null;
  online?: boolean | null;
  mobile?: boolean | null;
  download?: boolean | null;
};

export type ShoppingOffer = {
  id: string;
  category: ShoppingCategoryId;
  provider: string;
  name: string;
  sourceUrl: string;
  sourceLabel: string;
  verifiedAt: string | null;
  starter: boolean;
  notes: string[];
  metrics: ShoppingOfferMetrics;
};

export type ShoppingEvaluation = {
  offer: ShoppingOffer;
  matchScore: number;
  estimatedCost: number | null;
  monthlyPayment: number | null;
  totalInterest: number | null;
  savingsVsCurrent: number | null;
  reasons: string[];
  cautions: string[];
  metricLabelFr: string;
  metricLabelEn: string;
};

export const SHOPPING_CATEGORIES: Array<{
  id: ShoppingCategoryId;
  labelFr: string;
  labelEn: string;
  descriptionFr: string;
  descriptionEn: string;
}> = [
  {
    id: "credit_card",
    labelFr: "Cartes de crédit",
    labelEn: "Credit cards",
    descriptionFr: "Frais, taux, récompenses et valeur nette estimée.",
    descriptionEn: "Fees, rates, rewards and estimated net value.",
  },
  {
    id: "banking",
    labelFr: "Bancaire",
    labelEn: "Banking",
    descriptionFr: "Comptes, frais mensuels, transactions et intérêts.",
    descriptionEn: "Accounts, monthly fees, transactions and interest.",
  },
  {
    id: "mortgage",
    labelFr: "Hypothèques",
    labelEn: "Mortgages",
    descriptionFr: "Paiement, coût du terme, taux fixe ou variable et frais.",
    descriptionEn: "Payment, term cost, fixed or variable rate and fees.",
  },
  {
    id: "student_loan",
    labelFr: "Prêts étudiants",
    labelEn: "Student loans",
    descriptionFr: "Prêt public, marge étudiante et coût de financement.",
    descriptionEn: "Public loans, student lines and financing cost.",
  },
  {
    id: "personal_loan",
    labelFr: "Prêts personnels",
    labelEn: "Personal loans",
    descriptionFr: "TAEG, mensualité, durée et coût total du crédit.",
    descriptionEn: "APR, monthly payment, term and total borrowing cost.",
  },
  {
    id: "auto_insurance",
    labelFr: "Assurance automobile",
    labelEn: "Auto insurance",
    descriptionFr: "Prime, franchise, couverture et comparaison de soumissions.",
    descriptionEn: "Premium, deductible, coverage and quote comparison.",
  },
  {
    id: "life_insurance",
    labelFr: "Assurance-vie",
    labelEn: "Life insurance",
    descriptionFr: "Prime, capital assuré, terme et caractéristiques de couverture.",
    descriptionEn: "Premium, coverage amount, term and policy features.",
  },
  {
    id: "tax",
    labelFr: "Impôts",
    labelEn: "Taxes",
    descriptionFr: "Logiciels certifiés, prix et compatibilité avec ta situation.",
    descriptionEn: "Certified software, price and fit with your tax situation.",
  },
];

export const SHOPPING_SOURCES: ShoppingSource[] = [
  {
    id: "fcac-credit-card-tool",
    category: "credit_card",
    nameFr: "Outil de comparaison de cartes de crédit — ACFC",
    nameEn: "Credit Card Comparison Tool — FCAC",
    descriptionFr: "Données fournies par les institutions financières à l’Agence de la consommation en matière financière du Canada.",
    descriptionEn: "Product information supplied by financial institutions to the Financial Consumer Agency of Canada.",
    urlFr: "https://itools-ioutils.fcac-acfc.gc.ca/CCCT-OCCC/SearchFilter-fra.aspx",
    urlEn: "https://itools-ioutils.fcac-acfc.gc.ca/CCCT-OCCC/SearchFilter-eng.aspx",
    official: true,
    kind: "comparison",
  },
  {
    id: "fcac-account-tool",
    category: "banking",
    nameFr: "Outil de comparaison de comptes — ACFC",
    nameEn: "Account Comparison Tool — FCAC",
    descriptionFr: "Compare les frais mensuels, transactions, taux d’intérêt et services de comptes chèques et d’épargne.",
    descriptionEn: "Compare monthly fees, transactions, interest rates and services for chequing and savings accounts.",
    urlFr: "https://itools-ioutils.fcac-acfc.gc.ca/ACT-OCC/SearchFilter-fra.aspx",
    urlEn: "https://itools-ioutils.fcac-acfc.gc.ca/ACT-OCC/SearchFilter-eng.aspx",
    official: true,
    kind: "comparison",
  },
  {
    id: "fcac-mortgage-tools",
    category: "mortgage",
    nameFr: "Outils hypothécaires — Canada.ca",
    nameEn: "Mortgage tools — Canada.ca",
    descriptionFr: "Calculatrice hypothécaire, outil d’admissibilité et guides sur les taux, termes et amortissements.",
    descriptionEn: "Mortgage calculator, qualifier and guidance on rates, terms and amortization.",
    urlFr: "https://www.canada.ca/fr/services/finance/outils.html",
    urlEn: "https://www.canada.ca/en/services/finance/tools.html",
    official: true,
    kind: "calculator",
  },
  {
    id: "fcac-student-credit",
    category: "student_loan",
    nameFr: "Prêts et marges de crédit étudiants — ACFC",
    nameEn: "Student loans and lines of credit — FCAC",
    descriptionFr: "Explique les différences entre prêts gouvernementaux et marges de crédit étudiantes.",
    descriptionEn: "Explains differences between government student loans and student lines of credit.",
    urlFr: "https://www.canada.ca/fr/agence-consommation-matiere-financiere/services/prets/marges-credit-etudiants.html",
    urlEn: "https://www.canada.ca/en/financial-consumer-agency/services/loans/student-lines-credit.html",
    official: true,
    kind: "guide",
  },
  {
    id: "fcac-personal-loans",
    category: "personal_loan",
    nameFr: "Prêts personnels — ACFC",
    nameEn: "Personal loans — FCAC",
    descriptionFr: "Guide sur le coût total, les intérêts, les frais et la comparaison des termes.",
    descriptionEn: "Guidance on total cost, interest, fees and term comparisons.",
    urlFr: "https://www.canada.ca/fr/agence-consommation-matiere-financiere/services/prets/prets-personnels.html",
    urlEn: "https://www.canada.ca/en/financial-consumer-agency/services/loans/personal.html",
    official: true,
    kind: "guide",
  },
  {
    id: "fcac-insurance-shopping",
    category: "auto_insurance",
    nameFr: "Magasiner ses assurances — ACFC",
    nameEn: "Shopping for insurance — FCAC",
    descriptionFr: "Guide pour obtenir plusieurs soumissions et comparer prix, protections, exclusions et franchises.",
    descriptionEn: "Guidance on getting multiple quotes and comparing price, coverage, exclusions and deductibles.",
    urlFr: "https://www.canada.ca/fr/agence-consommation-matiere-financiere/services/assurance/obtenir-assurance.html",
    urlEn: "https://www.canada.ca/en/financial-consumer-agency/services/insurance/get-insurance.html",
    official: true,
    kind: "guide",
  },
  {
    id: "fcac-life-insurance",
    category: "life_insurance",
    nameFr: "Assurance-vie — ACFC",
    nameEn: "Life insurance — FCAC",
    descriptionFr: "Guide sur l’assurance temporaire et permanente, le capital-décès et les éléments à comparer.",
    descriptionEn: "Guidance on term and permanent insurance, death benefits and comparison factors.",
    urlFr: "https://www.canada.ca/fr/agence-consommation-matiere-financiere/services/assurance/vie.html",
    urlEn: "https://www.canada.ca/en/financial-consumer-agency/services/insurance/life.html",
    official: true,
    kind: "guide",
  },
  {
    id: "cra-tax-software",
    category: "tax",
    nameFr: "Logiciels d’impôt certifiés — ARC",
    nameEn: "Certified tax software — CRA",
    descriptionFr: "Liste officielle des logiciels NETFILE certifiés, avec coûts, plateformes et services disponibles.",
    descriptionEn: "Official list of NETFILE-certified software with cost categories, platforms and available services.",
    urlFr: "https://www.canada.ca/fr/services/impots/impot-sur-le-revenu/impot-sur-le-revenu-des-particuliers/comment-produire-declaration/logiciel-impot/trouver-logiciel.html",
    urlEn: "https://www.canada.ca/en/services/taxes/income-tax/personal-income-tax/how-file/tax-software/find-software.html",
    official: true,
    kind: "registry",
  },
];

const FCAC_ACCOUNT_TOOL =
  "https://itools-ioutils.fcac-acfc.gc.ca/ACT-OCC/SearchFilter-eng.aspx";
const CRA_TAX_SOFTWARE =
  "https://www.canada.ca/en/services/taxes/income-tax/personal-income-tax/how-file/tax-software/find-software.html";

export const STARTER_OFFERS: ShoppingOffer[] = [
  {
    id: "fcac-tangerine-chequing",
    category: "banking",
    provider: "Tangerine Bank",
    name: "Tangerine Chequing Account",
    sourceUrl: FCAC_ACCOUNT_TOOL,
    sourceLabel: "ACFC / FCAC",
    verifiedAt: "2026-09-24",
    starter: true,
    notes: [
      "Unlimited combined transactions in the FCAC comparison record.",
      "Interest is tiered by balance; the base tier is used only as a comparison input.",
    ],
    metrics: {
      monthlyFee: 0,
      includedTransactions: 9999,
      transactionFee: 0,
      savingsRatePercent: 0.01,
      eTransfersIncluded: true,
    },
  },
  {
    id: "fcac-scotia-basic",
    category: "banking",
    provider: "Scotiabank",
    name: "Basic Bank Account",
    sourceUrl: FCAC_ACCOUNT_TOOL,
    sourceLabel: "ACFC / FCAC",
    verifiedAt: "2026-09-24",
    starter: true,
    notes: [
      "FCAC comparison record lists 18 combined transactions.",
      "Verify current waivers, eligibility and transaction rules before opening an account.",
    ],
    metrics: {
      monthlyFee: 3.95,
      includedTransactions: 18,
      transactionFee: 1.25,
      savingsRatePercent: 0,
      eTransfersIncluded: true,
    },
  },
  {
    id: "fcac-bmo-practical",
    category: "banking",
    provider: "BMO",
    name: "Primary Chequing Account with Practical Plan",
    sourceUrl: FCAC_ACCOUNT_TOOL,
    sourceLabel: "ACFC / FCAC",
    verifiedAt: "2026-09-24",
    starter: true,
    notes: [
      "FCAC comparison record lists 12 combined transactions.",
      "Verify the provider page for any current promotion or eligibility condition.",
    ],
    metrics: {
      monthlyFee: 4,
      includedTransactions: 12,
      transactionFee: 1.25,
      savingsRatePercent: 0,
      eTransfersIncluded: true,
    },
  },
  {
    id: "cra-wealthsimple-tax",
    category: "tax",
    provider: "Wealthsimple",
    name: "Wealthsimple Tax",
    sourceUrl: CRA_TAX_SOFTWARE,
    sourceLabel: "ARC / CRA",
    verifiedAt: "2026-09-24",
    starter: true,
    notes: ["CRA lists free filing with optional paid services."],
    metrics: {
      taxPrice: 0,
      taxCostMode: "free_optional_paid",
      supportsQuebec: null,
      supportsSelfEmployed: null,
      supportsForeignAssets: null,
      online: true,
      mobile: null,
      download: false,
    },
  },
  {
    id: "cra-genutax",
    category: "tax",
    provider: "GenuSource Consulting",
    name: "GenuTax Standard",
    sourceUrl: "https://www.canada.ca/en/services/taxes/income-tax/personal-income-tax/how-file/tax-software/find-software/genutax-details.html",
    sourceLabel: "ARC / CRA",
    verifiedAt: "2026-09-24",
    starter: true,
    notes: ["CRA lists the software as free.", "CRA notes that it does not calculate/file the Québec TP-1 return."],
    metrics: {
      taxPrice: 0,
      taxCostMode: "free",
      supportsQuebec: false,
      supportsSelfEmployed: null,
      supportsForeignAssets: null,
      online: false,
      mobile: false,
      download: true,
    },
  },
  {
    id: "cra-cloudtax-free",
    category: "tax",
    provider: "CloudTax",
    name: "CloudTax Free",
    sourceUrl: "https://www.canada.ca/en/services/taxes/income-tax/personal-income-tax/how-file/tax-software/find-software/cloudtax-details.html",
    sourceLabel: "ARC / CRA",
    verifiedAt: "2026-09-24",
    starter: true,
    notes: ["CRA lists a free online product and free mobile offerings for supported tax years."],
    metrics: {
      taxPrice: 0,
      taxCostMode: "free",
      supportsQuebec: null,
      supportsSelfEmployed: null,
      supportsForeignAssets: true,
      online: true,
      mobile: true,
      download: false,
    },
  },
  {
    id: "cra-turbotax",
    category: "tax",
    provider: "Intuit Canada",
    name: "TurboTax",
    sourceUrl: "https://www.canada.ca/en/services/taxes/income-tax/personal-income-tax/how-file/tax-software/find-software/turbotax-details.html",
    sourceLabel: "ARC / CRA",
    verifiedAt: "2026-09-24",
    starter: true,
    notes: ["CRA lists paid services and free offerings depending on tax situation."],
    metrics: {
      taxPrice: null,
      taxCostMode: "paid_free_eligible",
      supportsQuebec: null,
      supportsSelfEmployed: null,
      supportsForeignAssets: true,
      online: true,
      mobile: true,
      download: true,
    },
  },
];

export const DEFAULT_SHOPPING_PROFILE: ShoppingProfile = {
  province: "QC",
  priority: "lowest_cost",
  monthlyCardSpend: 1800,
  carriedCardBalance: 0,
  averageBankBalance: 3500,
  monthlyTransactions: 25,
  loanAmount: 350000,
  amortizationYears: 25,
  desiredCoverage: 500000,
  taxSelfEmployed: false,
  taxForeignAssets: false,
  taxQuebecReturn: true,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function finite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function canadianMortgageMonthlyRate(ratePercent: number): number {
  const nominal = Math.max(0, ratePercent) / 100;
  return Math.pow(1 + nominal / 2, 2 / 12) - 1;
}

function paymentForRate(
  principal: number,
  monthlyRate: number,
  months: number,
): number {
  if (principal <= 0 || months <= 0) return 0;
  if (monthlyRate <= 0) return principal / months;
  return (
    (principal * monthlyRate) /
    (1 - Math.pow(1 + monthlyRate, -months))
  );
}

function amortizedInterestOverTerm(
  principal: number,
  monthlyRate: number,
  payment: number,
  termMonths: number,
): number {
  let balance = principal;
  let interest = 0;
  for (let index = 0; index < termMonths && balance > 0.01; index += 1) {
    const monthInterest = balance * monthlyRate;
    const principalPaid = Math.max(0, Math.min(balance, payment - monthInterest));
    interest += monthInterest;
    balance -= principalPaid;
    if (principalPaid <= 0 && monthlyRate > 0) break;
  }
  return interest;
}

function evaluateCost(
  offer: ShoppingOffer,
  profile: ShoppingProfile,
): {
  cost: number | null;
  payment: number | null;
  interest: number | null;
  reasons: string[];
  cautions: string[];
  labelFr: string;
  labelEn: string;
} {
  const m = offer.metrics;
  const reasons: string[] = [];
  const cautions: string[] = [];

  if (offer.category === "credit_card") {
    const annualFee = m.annualFee ?? 0;
    const apr = m.purchaseRatePercent ?? 0;
    const rewardRate = m.rewardRatePercent ?? 0;
    const welcome = m.welcomeValue ?? 0;
    const interest = Math.max(0, profile.carriedCardBalance) * (apr / 100);
    const rewards =
      Math.max(0, profile.monthlyCardSpend) * 12 * (rewardRate / 100);
    const firstYearCost = annualFee + interest - rewards - welcome;
    if (profile.carriedCardBalance > 0 && apr > 0) {
      cautions.push("Le solde reporté peut dominer la valeur des récompenses.");
    }
    if (rewardRate > 0) reasons.push("Récompenses estimées à partir du taux saisi.");
    if (annualFee === 0) reasons.push("Aucuns frais annuels saisis.");
    return {
      cost: firstYearCost,
      payment: null,
      interest,
      reasons,
      cautions,
      labelFr: "Coût net estimé · 1re année",
      labelEn: "Estimated net cost · year 1",
    };
  }

  if (offer.category === "banking") {
    const monthlyFee = m.monthlyFee ?? 0;
    const included = m.includedTransactions ?? 0;
    const overage = Math.max(0, profile.monthlyTransactions - included);
    const transactionFee = m.transactionFee ?? 0;
    const interestEarned =
      Math.max(0, profile.averageBankBalance) *
      ((m.savingsRatePercent ?? 0) / 100);
    const annualCost =
      monthlyFee * 12 + overage * transactionFee * 12 - interestEarned;
    if ((m.includedTransactions ?? 0) >= profile.monthlyTransactions) {
      reasons.push("Le nombre de transactions saisi est couvert.");
    } else if (transactionFee > 0) {
      cautions.push("Des frais de dépassement sont inclus dans l’estimation.");
    }
    if (m.eTransfersIncluded) reasons.push("Virements Interac indiqués comme inclus.");
    return {
      cost: annualCost,
      payment: null,
      interest: null,
      reasons,
      cautions,
      labelFr: "Coût annuel estimé",
      labelEn: "Estimated annual cost",
    };
  }

  if (offer.category === "mortgage") {
    if (!finite(m.interestRatePercent)) {
      return {
        cost: null,
        payment: null,
        interest: null,
        reasons,
        cautions: ["Ajoute un taux pour calculer le coût."],
        labelFr: "Coût du terme estimé",
        labelEn: "Estimated term cost",
      };
    }
    const monthlyRate = canadianMortgageMonthlyRate(m.interestRatePercent);
    const amortizationMonths = Math.max(12, profile.amortizationYears * 12);
    const payment = paymentForRate(
      Math.max(0, profile.loanAmount),
      monthlyRate,
      amortizationMonths,
    );
    const termMonths = clamp(m.termMonths ?? 60, 1, amortizationMonths);
    const interest = amortizedInterestOverTerm(
      Math.max(0, profile.loanAmount),
      monthlyRate,
      payment,
      termMonths,
    );
    const cost = interest + (m.upfrontFees ?? 0);
    reasons.push(
      m.rateType === "variable"
        ? "Scénario à taux variable saisi."
        : "Scénario à taux fixe/autre saisi.",
    );
    cautions.push(
      "Le calcul compare le taux et les frais saisis; pénalités, remises et conditions contractuelles peuvent modifier le coût réel.",
    );
    return {
      cost,
      payment,
      interest,
      reasons,
      cautions,
      labelFr: "Intérêts + frais sur le terme",
      labelEn: "Interest + fees over term",
    };
  }

  if (
    offer.category === "student_loan" ||
    offer.category === "personal_loan"
  ) {
    if (!finite(m.interestRatePercent)) {
      return {
        cost: null,
        payment: null,
        interest: null,
        reasons,
        cautions: ["Ajoute un taux pour calculer le coût."],
        labelFr: "Coût du crédit estimé",
        labelEn: "Estimated borrowing cost",
      };
    }
    const months = Math.max(1, m.termMonths ?? 60);
    const monthlyRate = Math.max(0, m.interestRatePercent) / 1200;
    const principal = Math.max(0, profile.loanAmount);
    const payment = paymentForRate(principal, monthlyRate, months);
    const interest = Math.max(0, payment * months - principal);
    const cost = interest + (m.upfrontFees ?? 0);
    if (offer.category === "student_loan") {
      cautions.push(
        "Les prêts gouvernementaux et les marges étudiantes peuvent avoir des règles de remboursement très différentes.",
      );
    }
    return {
      cost,
      payment,
      interest,
      reasons,
      cautions,
      labelFr: "Intérêts + frais estimés",
      labelEn: "Estimated interest + fees",
    };
  }

  if (
    offer.category === "auto_insurance" ||
    offer.category === "life_insurance"
  ) {
    const premium = m.annualPremium;
    if (!finite(premium)) {
      return {
        cost: null,
        payment: null,
        interest: null,
        reasons,
        cautions: ["Ajoute la prime annuelle de la soumission."],
        labelFr: "Prime annuelle",
        labelEn: "Annual premium",
      };
    }
    if (
      finite(m.coverageAmount) &&
      profile.desiredCoverage > 0 &&
      m.coverageAmount >= profile.desiredCoverage
    ) {
      reasons.push("Le capital/protection saisi atteint la cible.");
    }
    if (
      finite(m.coverageAmount) &&
      profile.desiredCoverage > 0 &&
      m.coverageAmount < profile.desiredCoverage
    ) {
      cautions.push("La protection saisie est inférieure à la cible.");
    }
    if (finite(m.deductible)) {
      cautions.push("Compare la franchise avec le prix, pas la prime seule.");
    }
    return {
      cost: premium,
      payment: premium / 12,
      interest: null,
      reasons,
      cautions,
      labelFr: "Prime annuelle",
      labelEn: "Annual premium",
    };
  }

  const price = m.taxPrice ?? null;
  if (profile.taxQuebecReturn && m.supportsQuebec === false) {
    cautions.push("Ce logiciel est indiqué comme non compatible avec la déclaration TP-1 du Québec.");
  }
  if (profile.taxForeignAssets && m.supportsForeignAssets === false) {
    cautions.push("Les besoins liés aux actifs étrangers ne sont pas couverts selon les informations saisies.");
  }
  if (profile.taxSelfEmployed && m.supportsSelfEmployed === false) {
    cautions.push("Le profil travailleur autonome n’est pas couvert selon les informations saisies.");
  }
  if (m.taxCostMode === "free" || m.taxCostMode === "free_optional_paid") {
    reasons.push("Une option gratuite est indiquée dans la source.");
  }
  if (m.online) reasons.push("Utilisation en ligne.");
  if (m.mobile) reasons.push("Application mobile indiquée.");
  return {
    cost: price,
    payment: null,
    interest: null,
    reasons,
    cautions,
    labelFr: "Coût saisi / offre gratuite",
    labelEn: "Entered cost / free offer",
  };
}

function preferenceBonus(
  offer: ShoppingOffer,
  profile: ShoppingProfile,
): number {
  const m = offer.metrics;
  let bonus = 0;

  if (profile.priority === "lowest_rate") {
    const rate =
      m.purchaseRatePercent ?? m.interestRatePercent ?? null;
    if (finite(rate)) bonus += clamp(24 - rate * 2.5, -10, 24);
  }

  if (profile.priority === "rewards" && offer.category === "credit_card") {
    bonus += clamp((m.rewardRatePercent ?? 0) * 7, 0, 20);
    bonus += clamp((m.welcomeValue ?? 0) / 50, 0, 10);
  }

  if (profile.priority === "simplicity") {
    if ((m.annualFee ?? 0) === 0 && (m.monthlyFee ?? 0) === 0) bonus += 12;
    if (m.online) bonus += 5;
  }

  if (profile.priority === "flexibility") {
    if (m.rateType === "variable") bonus += 4;
    if (m.online) bonus += 4;
    if (m.mobile) bonus += 4;
    if (m.download) bonus += 2;
  }

  if (
    profile.priority === "coverage" &&
    finite(m.coverageAmount) &&
    profile.desiredCoverage > 0
  ) {
    bonus += clamp((m.coverageAmount / profile.desiredCoverage) * 14, 0, 20);
  }

  return bonus;
}

export function evaluateShoppingOffers(
  offers: ShoppingOffer[],
  profile: ShoppingProfile,
  currentOfferId: string | null,
): ShoppingEvaluation[] {
  const raw = offers.map((offer) => ({
    offer,
    ...evaluateCost(offer, profile),
  }));

  const numericCosts = raw
    .map((item) => item.cost)
    .filter((value): value is number => finite(value));
  const minimumCost = numericCosts.length ? Math.min(...numericCosts) : null;
  const maximumCost = numericCosts.length ? Math.max(...numericCosts) : null;

  const current = raw.find((item) => item.offer.id === currentOfferId);
  const currentCost = current?.cost ?? null;

  return raw
    .map((item) => {
      let costScore = 45;
      if (
        finite(item.cost) &&
        finite(minimumCost) &&
        finite(maximumCost)
      ) {
        if (Math.abs(maximumCost - minimumCost) < 0.0001) {
          costScore = 55;
        } else {
          costScore =
            25 +
            ((maximumCost - item.cost) /
              (maximumCost - minimumCost)) *
              45;
        }
      }

      let score =
        25 +
        costScore +
        preferenceBonus(item.offer, profile);

      if (profile.priority !== "lowest_cost") {
        score -= 6;
      }

      if (
        item.offer.category === "tax" &&
        profile.taxQuebecReturn &&
        item.offer.metrics.supportsQuebec === false
      ) {
        score -= 48;
      }

      if (
        (item.offer.category === "auto_insurance" ||
          item.offer.category === "life_insurance") &&
        finite(item.offer.metrics.coverageAmount) &&
        profile.desiredCoverage > 0 &&
        item.offer.metrics.coverageAmount < profile.desiredCoverage
      ) {
        score -= 28;
      }

      const savingsVsCurrent =
        item.offer.id !== currentOfferId &&
        finite(currentCost) &&
        finite(item.cost)
          ? currentCost - item.cost
          : null;

      return {
        offer: item.offer,
        matchScore: Math.round(clamp(score, 5, 99)),
        estimatedCost: item.cost,
        monthlyPayment: item.payment,
        totalInterest: item.interest,
        savingsVsCurrent,
        reasons: item.reasons,
        cautions: item.cautions,
        metricLabelFr: item.labelFr,
        metricLabelEn: item.labelEn,
      };
    })
    .sort((a, b) => {
      if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
      const costA = a.estimatedCost ?? Number.POSITIVE_INFINITY;
      const costB = b.estimatedCost ?? Number.POSITIVE_INFINITY;
      return costA - costB;
    });
}

export function offersForCategory(
  category: ShoppingCategoryId,
  offers: ShoppingOffer[],
): ShoppingOffer[] {
  return offers.filter((offer) => offer.category === category);
}

export function sourcesForCategory(
  category: ShoppingCategoryId,
): ShoppingSource[] {
  return SHOPPING_SOURCES.filter((source) => source.category === category);
}

export function emptyOfferFor(
  category: ShoppingCategoryId,
): ShoppingOffer {
  return {
    id: "",
    category,
    provider: "",
    name: "",
    sourceUrl: "",
    sourceLabel: "Ajout manuel / Manual entry",
    verifiedAt: null,
    starter: false,
    notes: [],
    metrics: {},
  };
}
