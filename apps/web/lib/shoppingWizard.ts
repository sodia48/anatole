import {
  DEFAULT_SHOPPING_PROFILE,
  SHOPPING_SOURCES,
  type ShoppingCategoryId,
  type ShoppingPriority,
  type ShoppingProfile,
} from "@/lib/shopping";

export type ShoppingAnswer = string | number | boolean;
export type ShoppingAnswers = Record<string, ShoppingAnswer | undefined>;

export type ShoppingQuestionOption = {
  value: string;
  labelFr: string;
  labelEn: string;
  detailFr?: string;
  detailEn?: string;
};

export type ShoppingQuestion = {
  id: string;
  type: "choice" | "number" | "select";
  promptFr: string;
  promptEn: string;
  helperFr: string;
  helperEn: string;
  suffixFr?: string;
  suffixEn?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: ShoppingQuestionOption[];
  when?: (answers: ShoppingAnswers) => boolean;
};

export type ShoppingPathSuggestion = {
  id: string;
  titleFr: string;
  titleEn: string;
  descriptionFr: string;
  descriptionEn: string;
  matchScore: number;
  whyFr: string[];
  whyEn: string[];
  watchFr: string[];
  watchEn: string[];
  sourceIds: string[];
};

const PROVINCES: ShoppingQuestionOption[] = [
  { value: "AB", labelFr: "Alberta", labelEn: "Alberta" },
  { value: "BC", labelFr: "Colombie-Britannique", labelEn: "British Columbia" },
  { value: "MB", labelFr: "Manitoba", labelEn: "Manitoba" },
  { value: "NB", labelFr: "Nouveau-Brunswick", labelEn: "New Brunswick" },
  { value: "NL", labelFr: "Terre-Neuve-et-Labrador", labelEn: "Newfoundland and Labrador" },
  { value: "NS", labelFr: "Nouvelle-Écosse", labelEn: "Nova Scotia" },
  { value: "NT", labelFr: "Territoires du Nord-Ouest", labelEn: "Northwest Territories" },
  { value: "NU", labelFr: "Nunavut", labelEn: "Nunavut" },
  { value: "ON", labelFr: "Ontario", labelEn: "Ontario" },
  { value: "PE", labelFr: "Île-du-Prince-Édouard", labelEn: "Prince Edward Island" },
  { value: "QC", labelFr: "Québec", labelEn: "Quebec" },
  { value: "SK", labelFr: "Saskatchewan", labelEn: "Saskatchewan" },
  { value: "YT", labelFr: "Yukon", labelEn: "Yukon" },
];

const yesNo = (
  yesFr: string,
  yesEn: string,
  noFr: string,
  noEn: string,
): ShoppingQuestionOption[] => [
  { value: "yes", labelFr: yesFr, labelEn: yesEn },
  { value: "no", labelFr: noFr, labelEn: noEn },
];

const BASE_PROVINCE: ShoppingQuestion = {
  id: "province",
  type: "select",
  promptFr: "Où habites-tu ?",
  promptEn: "Where do you live?",
  helperFr: "La province influence l’admissibilité, la fiscalité et certains marchés d’assurance.",
  helperEn: "Province can affect eligibility, taxation and some insurance markets.",
  options: PROVINCES,
};

const QUESTIONS: Record<ShoppingCategoryId, ShoppingQuestion[]> = {
  credit_card: [
    BASE_PROVINCE,
    {
      id: "monthly_spend",
      type: "number",
      promptFr: "Environ combien dépenses-tu par mois avec une carte ?",
      promptEn: "About how much do you spend on a card each month?",
      helperFr: "On utilise ce montant pour estimer la valeur potentielle des récompenses.",
      helperEn: "We use this to estimate the potential value of rewards.",
      suffixFr: "$ / mois",
      suffixEn: "$ / month",
      min: 0,
      max: 50000,
      step: 50,
    },
    {
      id: "balance_behavior",
      type: "choice",
      promptFr: "Est-ce que tu paies normalement ton solde au complet ?",
      promptEn: "Do you normally pay your balance in full?",
      helperFr: "Si tu reportes un solde, le taux d’intérêt devient généralement beaucoup plus important que les récompenses.",
      helperEn: "If you carry a balance, the interest rate usually matters much more than rewards.",
      options: [
        {
          value: "full",
          labelFr: "Oui, presque toujours",
          labelEn: "Yes, almost always",
          detailFr: "Je veux surtout optimiser frais et récompenses.",
          detailEn: "I mainly want to optimize fees and rewards.",
        },
        {
          value: "sometimes",
          labelFr: "Ça m’arrive de reporter un solde",
          labelEn: "I sometimes carry a balance",
          detailFr: "Le taux et les récompenses comptent tous les deux.",
          detailEn: "Rate and rewards both matter.",
        },
        {
          value: "carry",
          labelFr: "Oui, régulièrement",
          labelEn: "Yes, regularly",
          detailFr: "Le coût du crédit est prioritaire.",
          detailEn: "Borrowing cost is the priority.",
        },
      ],
    },
    {
      id: "carried_balance",
      type: "number",
      promptFr: "Quel solde reportes-tu habituellement ?",
      promptEn: "How much balance do you usually carry?",
      helperFr: "Une approximation suffit pour comparer coût d’intérêt et récompenses.",
      helperEn: "An estimate is enough to compare interest cost with rewards.",
      suffixFr: "$",
      suffixEn: "$",
      min: 0,
      max: 100000,
      step: 100,
      when: (answers) =>
        answers.balance_behavior === "carry" ||
        answers.balance_behavior === "sometimes",
    },
    {
      id: "reward_goal",
      type: "choice",
      promptFr: "Qu’est-ce que tu veux surtout obtenir de ta carte ?",
      promptEn: "What do you mainly want from your card?",
      helperFr: "Ça permet à Anatole de distinguer une carte simple, une carte de remise ou une carte voyage.",
      helperEn: "This helps Anatole distinguish a simple card, cashback card or travel card.",
      options: [
        { value: "cashback", labelFr: "Remises en argent", labelEn: "Cash back" },
        { value: "travel", labelFr: "Voyage et points", labelEn: "Travel and points" },
        { value: "low_fee", labelFr: "Le moins de frais possible", labelEn: "Lowest fees possible" },
        { value: "insurance", labelFr: "Assurances et avantages", labelEn: "Insurance and perks" },
      ],
    },
    {
      id: "spend_focus",
      type: "choice",
      promptFr: "Où dépenses-tu le plus avec ta carte ?",
      promptEn: "Where do you spend the most on your card?",
      helperFr: "Anatole utilise cette réponse pour faire remonter les cartes qui bonifient réellement tes dépenses dominantes.",
      helperEn: "Anatole uses this to surface cards that actually reward your dominant spending category.",
      options: [
        { value: "grocery", labelFr: "Épicerie", labelEn: "Groceries" },
        { value: "dining", labelFr: "Restaurants / livraison", labelEn: "Dining / delivery" },
        { value: "gas", labelFr: "Essence / recharge", labelEn: "Gas / EV charging" },
        { value: "transit", labelFr: "Transport / déplacements", labelEn: "Transit / commuting" },
        { value: "bills", labelFr: "Factures récurrentes", labelEn: "Recurring bills" },
        { value: "travel", labelFr: "Voyage", labelEn: "Travel" },
        { value: "everyday", labelFr: "Un peu de tout", labelEn: "A bit of everything" },
      ],
    },
    {
      id: "ecosystem",
      type: "choice",
      promptFr: "Utilises-tu déjà beaucoup l’un de ces écosystèmes ?",
      promptEn: "Do you already use one of these ecosystems heavily?",
      helperFr: "Certaines cartes prennent beaucoup plus de valeur si tu utilises déjà leurs partenaires.",
      helperEn: "Some cards become much more valuable when you already use their partner ecosystem.",
      options: [
        { value: "rogers", labelFr: "Rogers / Fido / Shaw / Comwave", labelEn: "Rogers / Fido / Shaw / Comwave" },
        { value: "pc", labelFr: "PC Optimum / Loblaw / Pharmaprix", labelEn: "PC Optimum / Loblaw / Shoppers" },
        { value: "scene", labelFr: "Scene+ / Sobeys / IGA / Cineplex", labelEn: "Scene+ / Sobeys / IGA / Cineplex" },
        { value: "none", labelFr: "Aucun en particulier", labelEn: "None in particular" },
      ],
    },
    {
      id: "fee_comfort",
      type: "choice",
      promptFr: "Combien es-tu prêt à payer en frais annuels ?",
      promptEn: "How much are you willing to pay in annual fees?",
      helperFr: "Une carte payante doit créer assez de valeur pour compenser ses frais.",
      helperEn: "A paid card should create enough value to offset its fee.",
      options: [
        { value: "none", labelFr: "0 $", labelEn: "$0" },
        { value: "moderate", labelFr: "Jusqu’à 120 $", labelEn: "Up to $120" },
        { value: "premium", labelFr: "Plus si les avantages valent la peine", labelEn: "More if the perks are worth it" },
      ],
    },
    {
      id: "travel_frequency",
      type: "choice",
      promptFr: "À quelle fréquence voyages-tu ?",
      promptEn: "How often do you travel?",
      helperFr: "Les cartes voyage ont surtout du sens si tu utilises réellement leurs crédits, points et assurances.",
      helperEn: "Travel cards make the most sense when you actually use their credits, points and insurance.",
      options: [
        { value: "none", labelFr: "Rarement", labelEn: "Rarely" },
        { value: "some", labelFr: "1 à 2 voyages / an", labelEn: "1–2 trips / year" },
        { value: "frequent", labelFr: "3+ voyages / an", labelEn: "3+ trips / year" },
      ],
    },
    {
      id: "income_band",
      type: "choice",
      promptFr: "Quel est ton revenu personnel approximatif ?",
      promptEn: "What is your approximate personal income?",
      helperFr: "Certaines cartes imposent un revenu minimal. Une fourchette suffit; Anatole n’a pas besoin d’un montant exact.",
      helperEn: "Some cards have minimum-income requirements. A range is enough; Anatole does not need an exact figure.",
      options: [
        { value: "under60", labelFr: "Moins de 60 000 $", labelEn: "Under $60,000" },
        { value: "60_100", labelFr: "60 000 $ à 99 999 $", labelEn: "$60,000–$99,999" },
        { value: "100_150", labelFr: "100 000 $ à 149 999 $", labelEn: "$100,000–$149,999" },
        { value: "150plus", labelFr: "150 000 $ et plus", labelEn: "$150,000+" },
        { value: "prefer_not", labelFr: "Je préfère ne pas répondre", labelEn: "Prefer not to say" },
      ],
    },
  ],
  banking: [
    BASE_PROVINCE,
    {
      id: "banking_goal",
      type: "choice",
      promptFr: "Quel est ton besoin principal ?",
      promptEn: "What is your main need?",
      helperFr: "Compte quotidien, épargne ou un mélange des deux.",
      helperEn: "Everyday banking, saving, or both.",
      options: [
        { value: "everyday", labelFr: "Compte de tous les jours", labelEn: "Everyday account" },
        { value: "savings", labelFr: "Faire fructifier mon épargne", labelEn: "Grow my savings" },
        { value: "both", labelFr: "Les deux", labelEn: "Both" },
      ],
    },
    {
      id: "monthly_transactions",
      type: "number",
      promptFr: "Combien de transactions fais-tu environ chaque mois ?",
      promptEn: "About how many transactions do you make each month?",
      helperFr: "Débits, paiements, retraits et virements peuvent influencer les frais.",
      helperEn: "Debits, payments, withdrawals and transfers can affect fees.",
      suffixFr: "transactions",
      suffixEn: "transactions",
      min: 0,
      max: 300,
      step: 1,
    },
    {
      id: "average_balance",
      type: "number",
      promptFr: "Quel solde moyen gardes-tu dans ce compte ?",
      promptEn: "What average balance do you keep in the account?",
      helperFr: "Certains comptes offrent des intérêts ou réduisent des frais selon le solde.",
      helperEn: "Some accounts pay interest or reduce fees based on balance.",
      suffixFr: "$",
      suffixEn: "$",
      min: 0,
      max: 1000000,
      step: 100,
    },
    {
      id: "branch_need",
      type: "choice",
      promptFr: "As-tu besoin d’une succursale physique ?",
      promptEn: "Do you need a physical branch?",
      helperFr: "Une banque numérique peut coûter moins cher, mais elle ne convient pas à tout le monde.",
      helperEn: "A digital bank may cost less, but it does not suit everyone.",
      options: [
        { value: "never", labelFr: "Non", labelEn: "No" },
        { value: "sometimes", labelFr: "Parfois", labelEn: "Sometimes" },
        { value: "often", labelFr: "Oui, régulièrement", labelEn: "Yes, regularly" },
      ],
    },
    {
      id: "fee_tolerance",
      type: "choice",
      promptFr: "Quelle est ta tolérance aux frais mensuels ?",
      promptEn: "What is your tolerance for monthly fees?",
      helperFr: "Des frais peuvent être acceptables s’ils remplacent des coûts que tu paierais autrement.",
      helperEn: "Fees can be reasonable when they replace costs you would otherwise pay.",
      options: [
        { value: "zero", labelFr: "Je veux 0 $", labelEn: "I want $0" },
        { value: "low", labelFr: "Maximum 5 $ / mois", labelEn: "Up to $5 / month" },
        { value: "value", labelFr: "Je paie si la valeur est claire", labelEn: "I’ll pay if the value is clear" },
      ],
    },
    {
      id: "special_status",
      type: "choice",
      promptFr: "Un de ces profils te correspond-il ?",
      promptEn: "Does one of these profiles apply to you?",
      helperFr: "Des comptes à frais réduits ou nuls peuvent exister pour certains groupes.",
      helperEn: "Low-cost or no-cost accounts may exist for certain groups.",
      options: [
        { value: "none", labelFr: "Aucun", labelEn: "None" },
        { value: "student", labelFr: "Étudiant", labelEn: "Student" },
        { value: "newcomer", labelFr: "Nouvel arrivant", labelEn: "Newcomer" },
        { value: "senior", labelFr: "Aîné", labelEn: "Senior" },
      ],
    },
  ],
  mortgage: [
    BASE_PROVINCE,
    {
      id: "mortgage_stage",
      type: "choice",
      promptFr: "Où en es-tu dans ton projet ?",
      promptEn: "Where are you in your mortgage journey?",
      helperFr: "Achat, renouvellement et refinancement n’ont pas les mêmes compromis.",
      helperEn: "Purchase, renewal and refinance have different trade-offs.",
      options: [
        { value: "purchase", labelFr: "Nouvel achat", labelEn: "New purchase" },
        { value: "renewal", labelFr: "Renouvellement", labelEn: "Renewal" },
        { value: "refinance", labelFr: "Refinancement", labelEn: "Refinance" },
      ],
    },
    {
      id: "loan_amount",
      type: "number",
      promptFr: "Quel montant veux-tu financer ?",
      promptEn: "How much do you want to finance?",
      helperFr: "Anatole s’en sert pour illustrer le paiement et le coût du terme.",
      helperEn: "Anatole uses this to illustrate payment and term cost.",
      suffixFr: "$",
      suffixEn: "$",
      min: 10000,
      max: 5000000,
      step: 5000,
    },
    {
      id: "amortization",
      type: "choice",
      promptFr: "Quel amortissement envisages-tu ?",
      promptEn: "What amortization are you considering?",
      helperFr: "Un amortissement plus long réduit le paiement mais peut augmenter le coût total.",
      helperEn: "A longer amortization lowers the payment but may increase total cost.",
      options: [
        { value: "20", labelFr: "20 ans", labelEn: "20 years" },
        { value: "25", labelFr: "25 ans", labelEn: "25 years" },
        { value: "30", labelFr: "30 ans", labelEn: "30 years" },
      ],
    },
    {
      id: "rate_comfort",
      type: "choice",
      promptFr: "Qu’est-ce qui compte le plus pour toi ?",
      promptEn: "What matters most to you?",
      helperFr: "Cette réponse oriente le compromis entre stabilité et flexibilité.",
      helperEn: "This steers the trade-off between stability and flexibility.",
      options: [
        { value: "certainty", labelFr: "Paiement prévisible", labelEn: "Predictable payment" },
        { value: "flexibility", labelFr: "Plus de flexibilité", labelEn: "More flexibility" },
        { value: "balanced", labelFr: "Un compromis", labelEn: "A balance" },
      ],
    },
    {
      id: "change_horizon",
      type: "choice",
      promptFr: "Penses-tu vendre, refinancer ou faire un gros remboursement bientôt ?",
      promptEn: "Do you expect to sell, refinance or make a large prepayment soon?",
      helperFr: "Un horizon court peut rendre les pénalités et privilèges de remboursement plus importants que quelques points de taux.",
      helperEn: "A short horizon can make penalties and prepayment privileges more important than a few rate points.",
      options: [
        { value: "under3", labelFr: "Probablement dans moins de 3 ans", labelEn: "Probably within 3 years" },
        { value: "3to5", labelFr: "Peut-être dans 3 à 5 ans", labelEn: "Possibly in 3–5 years" },
        { value: "stable", labelFr: "Je pense rester 5+ ans", labelEn: "I expect to stay 5+ years" },
      ],
    },
    {
      id: "payment_buffer",
      type: "choice",
      promptFr: "Si ton paiement augmentait, quelle marge aurais-tu ?",
      promptEn: "If your payment increased, how much room would you have?",
      helperFr: "On ne demande pas ton revenu exact; seulement ta capacité à absorber une hausse.",
      helperEn: "We do not need exact income; only your ability to absorb an increase.",
      options: [
        { value: "tight", labelFr: "Très peu de marge", labelEn: "Very little room" },
        { value: "some", labelFr: "Une certaine marge", labelEn: "Some room" },
        { value: "comfortable", labelFr: "Marge confortable", labelEn: "Comfortable room" },
      ],
    },
  ],
  student_loan: [
    BASE_PROVINCE,
    {
      id: "student_stage",
      type: "choice",
      promptFr: "Quel type d’études poursuis-tu ?",
      promptEn: "What type of studies are you pursuing?",
      helperFr: "Les programmes d’aide et les besoins de financement peuvent varier.",
      helperEn: "Aid programs and financing needs can differ.",
      options: [
        { value: "college", labelFr: "Collégial / cégep", labelEn: "College" },
        { value: "undergrad", labelFr: "Université — 1er cycle", labelEn: "University — undergraduate" },
        { value: "graduate", labelFr: "Cycles supérieurs", labelEn: "Graduate studies" },
        { value: "professional", labelFr: "Programme professionnel", labelEn: "Professional program" },
      ],
    },
    {
      id: "loan_amount",
      type: "number",
      promptFr: "Quel manque de financement veux-tu couvrir ?",
      promptEn: "What funding gap do you need to cover?",
      helperFr: "On compare les pistes selon le montant à financer, pas le coût total de tes études.",
      helperEn: "We compare paths based on your funding gap, not your total education cost.",
      suffixFr: "$",
      suffixEn: "$",
      min: 0,
      max: 500000,
      step: 500,
    },
    {
      id: "government_aid",
      type: "choice",
      promptFr: "As-tu déjà vérifié ton admissibilité à l’aide gouvernementale ?",
      promptEn: "Have you already checked government student aid eligibility?",
      helperFr: "Les prêts et bourses publics peuvent avoir des modalités différentes d’une marge bancaire.",
      helperEn: "Public loans and grants can have different terms than a bank line of credit.",
      options: [
        { value: "not_checked", labelFr: "Pas encore", labelEn: "Not yet" },
        { value: "applied", labelFr: "Oui, demande faite", labelEn: "Yes, applied" },
        { value: "maxed", labelFr: "Oui, mais il reste un manque", labelEn: "Yes, but I still have a gap" },
      ],
    },
    {
      id: "cosigner",
      type: "choice",
      promptFr: "Aurais-tu accès à un cosignataire si une banque l’exige ?",
      promptEn: "Would you have access to a co-signer if a bank requires one?",
      helperFr: "Certaines marges étudiantes privées peuvent l’exiger selon le profil.",
      helperEn: "Some private student lines may require one depending on the profile.",
      options: yesNo("Oui", "Yes", "Non", "No"),
    },
    {
      id: "repayment_style",
      type: "choice",
      promptFr: "Quel style de remboursement préfères-tu ?",
      promptEn: "What repayment style do you prefer?",
      helperFr: "Paiement fixe pour la prévisibilité ou marge renouvelable pour la flexibilité.",
      helperEn: "Fixed payment for predictability or revolving credit for flexibility.",
      options: [
        { value: "fixed", labelFr: "Paiement fixe", labelEn: "Fixed payment" },
        { value: "flexible", labelFr: "Flexibilité maximale", labelEn: "Maximum flexibility" },
        { value: "unsure", labelFr: "Je ne sais pas encore", labelEn: "Not sure yet" },
      ],
    },
  ],
  personal_loan: [
    BASE_PROVINCE,
    {
      id: "loan_amount",
      type: "number",
      promptFr: "Combien veux-tu emprunter ?",
      promptEn: "How much do you want to borrow?",
      helperFr: "Le montant influence les produits réalistes à comparer.",
      helperEn: "The amount affects which products are realistic to compare.",
      suffixFr: "$",
      suffixEn: "$",
      min: 500,
      max: 500000,
      step: 500,
    },
    {
      id: "loan_purpose",
      type: "choice",
      promptFr: "À quoi servira principalement le financement ?",
      promptEn: "What is the financing mainly for?",
      helperFr: "Le besoin aide à distinguer prêt amorti, marge de crédit ou financement garanti.",
      helperEn: "The purpose helps distinguish an installment loan, line of credit or secured financing.",
      options: [
        { value: "consolidation", labelFr: "Consolider des dettes", labelEn: "Consolidate debt" },
        { value: "emergency", labelFr: "Dépense imprévue", labelEn: "Unexpected expense" },
        { value: "purchase", labelFr: "Achat important", labelEn: "Large purchase" },
        { value: "renovation", labelFr: "Rénovation / projet", labelEn: "Renovation / project" },
      ],
    },
    {
      id: "repayment_style",
      type: "choice",
      promptFr: "Tu préfères un paiement fixe ou pouvoir réutiliser le crédit ?",
      promptEn: "Do you prefer a fixed payment or reusable credit?",
      helperFr: "Un prêt amorti ferme la dette graduellement; une marge offre plus de flexibilité.",
      helperEn: "An installment loan pays down on schedule; a line offers more flexibility.",
      options: [
        { value: "fixed", labelFr: "Paiement fixe", labelEn: "Fixed payment" },
        { value: "revolving", labelFr: "Marge réutilisable", labelEn: "Reusable line" },
        { value: "lowest_cost", labelFr: "Je veux surtout minimiser le coût", labelEn: "I mainly want to minimize cost" },
      ],
    },
    {
      id: "homeowner",
      type: "choice",
      promptFr: "Es-tu propriétaire d’un logement avec de l’équité disponible ?",
      promptEn: "Do you own a home with available equity?",
      helperFr: "Une option garantie peut parfois coûter moins cher, mais elle met un actif en garantie.",
      helperEn: "Secured financing can sometimes cost less, but it puts an asset at risk.",
      options: yesNo("Oui", "Yes", "Non", "No"),
    },
    {
      id: "timeline",
      type: "choice",
      promptFr: "Quand veux-tu rembourser la dette ?",
      promptEn: "When do you want the debt repaid?",
      helperFr: "Une durée plus courte augmente le paiement mais peut réduire les intérêts.",
      helperEn: "A shorter term raises the payment but can reduce interest.",
      options: [
        { value: "under2", labelFr: "Moins de 2 ans", labelEn: "Under 2 years" },
        { value: "2to5", labelFr: "2 à 5 ans", labelEn: "2–5 years" },
        { value: "5plus", labelFr: "Plus de 5 ans", labelEn: "More than 5 years" },
      ],
    },
  ],
  auto_insurance: [
    BASE_PROVINCE,
    {
      id: "driver_experience",
      type: "choice",
      promptFr: "Depuis combien de temps conduis-tu ?",
      promptEn: "How long have you been driving?",
      helperFr: "L’expérience de conduite peut influencer la tarification.",
      helperEn: "Driving experience can affect pricing.",
      options: [
        { value: "under2", labelFr: "Moins de 2 ans", labelEn: "Under 2 years" },
        { value: "2to10", labelFr: "2 à 10 ans", labelEn: "2–10 years" },
        { value: "10plus", labelFr: "Plus de 10 ans", labelEn: "More than 10 years" },
      ],
    },
    {
      id: "annual_km",
      type: "choice",
      promptFr: "Combien de kilomètres fais-tu environ par année ?",
      promptEn: "About how many kilometres do you drive per year?",
      helperFr: "Un faible kilométrage peut rendre certaines tarifications plus intéressantes.",
      helperEn: "Low mileage can make some pricing models more attractive.",
      options: [
        { value: "under10", labelFr: "Moins de 10 000 km", labelEn: "Under 10,000 km" },
        { value: "10to20", labelFr: "10 000 à 20 000 km", labelEn: "10,000–20,000 km" },
        { value: "20plus", labelFr: "Plus de 20 000 km", labelEn: "More than 20,000 km" },
      ],
    },
    {
      id: "vehicle_use",
      type: "choice",
      promptFr: "Comment utilises-tu surtout ton véhicule ?",
      promptEn: "How do you mainly use your vehicle?",
      helperFr: "Personnel, navettage et affaires peuvent être tarifés différemment.",
      helperEn: "Personal, commuting and business use can be priced differently.",
      options: [
        { value: "personal", labelFr: "Personnel", labelEn: "Personal" },
        { value: "commute", labelFr: "Travail / navettage", labelEn: "Work / commuting" },
        { value: "business", labelFr: "Affaires", labelEn: "Business" },
      ],
    },
    {
      id: "deductible_style",
      type: "choice",
      promptFr: "Quel compromis franchise / prime préfères-tu ?",
      promptEn: "What deductible / premium trade-off do you prefer?",
      helperFr: "Une franchise plus élevée peut réduire la prime, mais augmente ce que tu paies lors d’un sinistre.",
      helperEn: "A higher deductible may reduce premium but increases what you pay after a claim.",
      options: [
        { value: "low", labelFr: "Franchise plus basse", labelEn: "Lower deductible" },
        { value: "balanced", labelFr: "Équilibre", labelEn: "Balanced" },
        { value: "high", labelFr: "Prime plus basse, franchise plus haute", labelEn: "Lower premium, higher deductible" },
      ],
    },
    {
      id: "bundle",
      type: "choice",
      promptFr: "As-tu aussi une assurance habitation ou locataire à regrouper ?",
      promptEn: "Do you also have home or tenant insurance to bundle?",
      helperFr: "Le regroupement peut parfois créer un rabais, mais il faut comparer le coût total.",
      helperEn: "Bundling can sometimes create a discount, but compare the total cost.",
      options: yesNo("Oui", "Yes", "Non", "No"),
    },
  ],
  life_insurance: [
    BASE_PROVINCE,
    {
      id: "dependants",
      type: "choice",
      promptFr: "Quelqu’un dépend-il financièrement de ton revenu ?",
      promptEn: "Does anyone financially depend on your income?",
      helperFr: "Le besoin de protection vise surtout à remplacer une obligation financière ou un revenu.",
      helperEn: "Coverage needs usually exist to replace an obligation or income.",
      options: yesNo("Oui", "Yes", "Non", "No"),
    },
    {
      id: "coverage_need",
      type: "number",
      promptFr: "Quel montant de protection veux-tu comparer ?",
      promptEn: "What amount of coverage do you want to compare?",
      helperFr: "Une estimation suffit pour filtrer les soumissions.",
      helperEn: "An estimate is enough to filter quotes.",
      suffixFr: "$",
      suffixEn: "$",
      min: 10000,
      max: 10000000,
      step: 10000,
    },
    {
      id: "coverage_horizon",
      type: "choice",
      promptFr: "Pendant combien de temps ce besoin existe-t-il ?",
      promptEn: "How long does this need exist?",
      helperFr: "Une obligation temporaire et un besoin permanent ne se financent pas de la même façon.",
      helperEn: "A temporary obligation and a permanent need are financed differently.",
      options: [
        { value: "10", labelFr: "Environ 10 ans", labelEn: "About 10 years" },
        { value: "20_30", labelFr: "20 à 30 ans", labelEn: "20–30 years" },
        { value: "lifetime", labelFr: "Toute la vie", labelEn: "Lifetime" },
        { value: "unsure", labelFr: "Je ne sais pas", labelEn: "Not sure" },
      ],
    },
    {
      id: "main_need",
      type: "choice",
      promptFr: "Quel besoin veux-tu surtout couvrir ?",
      promptEn: "What need do you mainly want to cover?",
      helperFr: "Hypothèque, revenu familial et succession peuvent mener à des horizons différents.",
      helperEn: "Mortgage, family income and estate needs can imply different horizons.",
      options: [
        { value: "income", labelFr: "Remplacer mon revenu", labelEn: "Replace my income" },
        { value: "mortgage", labelFr: "Couvrir l’hypothèque / dettes", labelEn: "Cover mortgage / debts" },
        { value: "estate", labelFr: "Succession / impôts / legs", labelEn: "Estate / taxes / legacy" },
        { value: "final", labelFr: "Frais finaux", labelEn: "Final expenses" },
      ],
    },
    {
      id: "budget_style",
      type: "choice",
      promptFr: "Quelle priorité donnes-tu au coût aujourd’hui ?",
      promptEn: "How important is cost today?",
      helperFr: "La couverture temporaire est souvent plus simple à comparer pour un besoin à durée définie.",
      helperEn: "Term coverage is often simpler to compare for a time-limited need.",
      options: [
        { value: "lowest", labelFr: "Prime la plus basse possible", labelEn: "Lowest premium possible" },
        { value: "balanced", labelFr: "Équilibre coût / durée", labelEn: "Balance cost / duration" },
        { value: "permanent", labelFr: "Je veux explorer une protection permanente", labelEn: "I want to explore permanent coverage" },
      ],
    },
  ],
  tax: [
    BASE_PROVINCE,
    {
      id: "tax_complexity",
      type: "choice",
      promptFr: "À quoi ressemble ta situation fiscale ?",
      promptEn: "What does your tax situation look like?",
      helperFr: "Le niveau de complexité aide à choisir entre logiciel gratuit, solution guidée et professionnel.",
      helperEn: "Complexity helps choose between free software, guided software and a professional.",
      options: [
        { value: "simple", labelFr: "Simple — emploi et feuillets courants", labelEn: "Simple — employment and common slips" },
        { value: "investing", labelFr: "Placements / gains en capital", labelEn: "Investments / capital gains" },
        { value: "self_employed", labelFr: "Travail autonome", labelEn: "Self-employed" },
        { value: "rental", labelFr: "Immobilier locatif", labelEn: "Rental property" },
        { value: "complex", labelFr: "Plusieurs éléments complexes", labelEn: "Several complex items" },
      ],
    },
    {
      id: "foreign_assets",
      type: "choice",
      promptFr: "Dois-tu possiblement produire un T1135 pour des biens étrangers ?",
      promptEn: "Might you need to file a T1135 for foreign property?",
      helperFr: "Certaines solutions certifiées offrent le T1135 et d’autres non.",
      helperEn: "Some certified products support T1135 and others do not.",
      options: [
        { value: "yes", labelFr: "Oui", labelEn: "Yes" },
        { value: "no", labelFr: "Non", labelEn: "No" },
        { value: "unsure", labelFr: "Je ne sais pas", labelEn: "Not sure" },
      ],
    },
    {
      id: "help_level",
      type: "choice",
      promptFr: "Quel niveau d’accompagnement veux-tu ?",
      promptEn: "How much guidance do you want?",
      helperFr: "Certaines personnes veulent seulement produire; d’autres veulent être guidées ou parler à un professionnel.",
      helperEn: "Some people only want to file; others want guidance or a professional.",
      options: [
        { value: "diy", labelFr: "Je suis autonome", labelEn: "I’m comfortable doing it myself" },
        { value: "guided", labelFr: "Je veux être guidé", labelEn: "I want guided help" },
        { value: "pro", labelFr: "Je préfère un professionnel", labelEn: "I prefer a professional" },
      ],
    },
    {
      id: "tax_budget",
      type: "choice",
      promptFr: "Quel budget veux-tu consacrer à la production ?",
      promptEn: "What budget do you want to spend on filing?",
      helperFr: "Anatole privilégiera les options gratuites lorsque cela correspond à ta situation.",
      helperEn: "Anatole will prioritize free options when they fit your situation.",
      options: [
        { value: "free", labelFr: "0 $ si possible", labelEn: "$0 if possible" },
        { value: "low", labelFr: "Je peux payer un peu", labelEn: "I can pay a little" },
        { value: "any", labelFr: "Le prix est secondaire", labelEn: "Price is secondary" },
      ],
    },
    {
      id: "device",
      type: "choice",
      promptFr: "Comment veux-tu produire ta déclaration ?",
      promptEn: "How do you want to file?",
      helperFr: "Web, mobile ou logiciel installé.",
      helperEn: "Web, mobile or installed software.",
      options: [
        { value: "online", labelFr: "Dans le navigateur", labelEn: "In the browser" },
        { value: "mobile", labelFr: "Sur mobile", labelEn: "On mobile" },
        { value: "download", labelFr: "Logiciel installé", labelEn: "Installed software" },
        { value: "any", labelFr: "Peu importe", labelEn: "No preference" },
      ],
    },
  ],
};

function stringAnswer(
  answers: ShoppingAnswers,
  key: string,
  fallback = "",
): string {
  const value = answers[key];
  return typeof value === "string" ? value : fallback;
}

function numberAnswer(
  answers: ShoppingAnswers,
  key: string,
  fallback = 0,
): number {
  const value = answers[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

export function shoppingQuestionsFor(
  category: ShoppingCategoryId,
  answers: ShoppingAnswers,
): ShoppingQuestion[] {
  return QUESTIONS[category].filter(
    (question) => !question.when || question.when(answers),
  );
}

export function questionAnswered(
  question: ShoppingQuestion,
  answers: ShoppingAnswers,
): boolean {
  const value = answers[question.id];
  if (question.type === "number") {
    return typeof value === "number" && Number.isFinite(value);
  }
  return typeof value === "string" && value.length > 0;
}

export function shoppingProfileFromAnswers(
  category: ShoppingCategoryId,
  answers: ShoppingAnswers,
): ShoppingProfile {
  const profile: ShoppingProfile = {
    ...DEFAULT_SHOPPING_PROFILE,
    province: stringAnswer(answers, "province", DEFAULT_SHOPPING_PROFILE.province),
  };

  if (category === "credit_card") {
    profile.monthlyCardSpend = numberAnswer(answers, "monthly_spend", 0);
    profile.carriedCardBalance =
      stringAnswer(answers, "balance_behavior") === "full"
        ? 0
        : numberAnswer(answers, "carried_balance", 0);

    const goal = stringAnswer(answers, "reward_goal");
    if (stringAnswer(answers, "balance_behavior") === "carry") {
      profile.priority = "lowest_rate";
    } else if (goal === "low_fee") {
      profile.priority = "lowest_cost";
    } else if (goal === "insurance") {
      profile.priority = "coverage";
    } else {
      profile.priority = "rewards";
    }
  }

  if (category === "banking") {
    profile.monthlyTransactions = numberAnswer(answers, "monthly_transactions", 0);
    profile.averageBankBalance = numberAnswer(answers, "average_balance", 0);
    profile.priority =
      stringAnswer(answers, "banking_goal") === "savings"
        ? "lowest_rate"
        : stringAnswer(answers, "fee_tolerance") === "zero"
          ? "lowest_cost"
          : "simplicity";
  }

  if (
    category === "mortgage" ||
    category === "student_loan" ||
    category === "personal_loan"
  ) {
    profile.loanAmount = numberAnswer(answers, "loan_amount", 0);
    if (category === "mortgage") {
      profile.amortizationYears = Number(
        stringAnswer(answers, "amortization", "25"),
      );
      profile.priority =
        stringAnswer(answers, "rate_comfort") === "flexibility"
          ? "flexibility"
          : stringAnswer(answers, "payment_buffer") === "tight"
            ? "simplicity"
            : "lowest_cost";
    } else {
      profile.priority =
        stringAnswer(answers, "repayment_style") === "flexible" ||
        stringAnswer(answers, "repayment_style") === "revolving"
          ? "flexibility"
          : "lowest_cost";
    }
  }

  if (category === "life_insurance") {
    profile.desiredCoverage = numberAnswer(answers, "coverage_need", 0);
    profile.priority =
      stringAnswer(answers, "budget_style") === "lowest"
        ? "lowest_cost"
        : "coverage";
  }

  if (category === "auto_insurance") {
    profile.priority =
      stringAnswer(answers, "deductible_style") === "high"
        ? "lowest_cost"
        : "coverage";
  }

  if (category === "tax") {
    profile.taxQuebecReturn = profile.province === "QC";
    profile.taxSelfEmployed =
      stringAnswer(answers, "tax_complexity") === "self_employed";
    profile.taxForeignAssets =
      stringAnswer(answers, "foreign_assets") === "yes";
    profile.priority =
      stringAnswer(answers, "tax_budget") === "free"
        ? "lowest_cost"
        : stringAnswer(answers, "help_level") === "guided"
          ? "simplicity"
          : "flexibility";
  }

  return profile;
}

function score(base: number, ...bonuses: Array<boolean | number>): number {
  let value = base;
  for (const bonus of bonuses) {
    value += typeof bonus === "number" ? bonus : bonus ? 10 : 0;
  }
  return Math.max(35, Math.min(98, Math.round(value)));
}

export function shoppingSuggestionsFor(
  category: ShoppingCategoryId,
  answers: ShoppingAnswers,
): ShoppingPathSuggestion[] {
  const province = stringAnswer(answers, "province", "QC");

  if (category === "credit_card") {
    const behavior = stringAnswer(answers, "balance_behavior");
    const reward = stringAnswer(answers, "reward_goal");
    const fees = stringAnswer(answers, "fee_comfort");
    const travel = stringAnswer(answers, "travel_frequency");
    const spend = numberAnswer(answers, "monthly_spend");

    return [
      {
        id: "card-low-rate",
        titleFr: "Carte à faible taux",
        titleEn: "Low-rate credit card",
        descriptionFr: "À privilégier si tu reportes un solde : le taux d’achat peut peser davantage que les points.",
        descriptionEn: "Prioritize this if you carry a balance: purchase interest can outweigh points.",
        matchScore: score(48, behavior === "carry" ? 38 : 0, behavior === "sometimes" ? 22 : 0),
        whyFr: [
          behavior === "carry"
            ? "Tu as indiqué reporter régulièrement un solde."
            : "Cette piste réduit le coût si un solde est parfois reporté.",
        ],
        whyEn: [
          behavior === "carry"
            ? "You indicated that you regularly carry a balance."
            : "This path lowers cost when a balance is sometimes carried.",
        ],
        watchFr: ["Comparer le taux d’achat réel, les frais annuels et les frais de transfert de solde."],
        watchEn: ["Compare the actual purchase rate, annual fee and balance-transfer fees."],
        sourceIds: ["fcac-credit-card-tool"],
      },
      {
        id: "card-no-fee-cashback",
        titleFr: "Carte sans frais avec remises",
        titleEn: "No-fee cashback card",
        descriptionFr: "Une structure simple : pas de frais annuels et une remise sur les dépenses courantes.",
        descriptionEn: "A simple structure: no annual fee and cash back on everyday spending.",
        matchScore: score(
          56,
          behavior === "full" ? 14 : 0,
          reward === "cashback" ? 18 : 0,
          fees === "none" ? 14 : 0,
          spend < 2500 ? 5 : 0,
        ),
        whyFr: [
          reward === "cashback"
            ? "Tu préfères une valeur facile à mesurer en argent."
            : "La simplicité réduit le risque de payer pour des avantages peu utilisés.",
        ],
        whyEn: [
          reward === "cashback"
            ? "You prefer value that is easy to measure in cash."
            : "Simplicity reduces the risk of paying for unused perks.",
        ],
        watchFr: ["Vérifier les catégories bonifiées, plafonds de remise et revenu minimal."],
        watchEn: ["Check bonus categories, cashback caps and minimum-income requirements."],
        sourceIds: ["fcac-credit-card-tool"],
      },
      {
        id: "card-travel",
        titleFr: "Carte voyage / points",
        titleEn: "Travel / points card",
        descriptionFr: "Peut créer plus de valeur si tu voyages assez pour utiliser les points, crédits et assurances.",
        descriptionEn: "Can create more value if you travel enough to use points, credits and insurance.",
        matchScore: score(
          48,
          reward === "travel" ? 22 : 0,
          travel === "frequent" ? 20 : travel === "some" ? 8 : -12,
          fees === "premium" ? 10 : fees === "none" ? -12 : 0,
          spend >= 2500 ? 8 : 0,
        ),
        whyFr: ["Le gain potentiel dépend surtout de ton utilisation réelle des avantages voyage."],
        whyEn: ["Potential value depends mostly on whether you actually use the travel benefits."],
        watchFr: ["Comparer frais annuels, valeur des points, frais FX, crédits voyage et assurances."],
        watchEn: ["Compare annual fee, point value, FX fees, travel credits and insurance."],
        sourceIds: ["fcac-credit-card-tool"],
      },
    ].sort((a, b) => b.matchScore - a.matchScore);
  }

  if (category === "banking") {
    const goal = stringAnswer(answers, "banking_goal");
    const branch = stringAnswer(answers, "branch_need");
    const fees = stringAnswer(answers, "fee_tolerance");
    const transactions = numberAnswer(answers, "monthly_transactions");

    return [
      {
        id: "bank-no-fee-digital",
        titleFr: "Compte quotidien sans frais",
        titleEn: "No-fee everyday account",
        descriptionFr: "À regarder en premier si les services numériques te conviennent et que tu veux éliminer les frais récurrents.",
        descriptionEn: "Start here if digital banking works for you and you want to eliminate recurring fees.",
        matchScore: score(58, fees === "zero" ? 22 : 0, branch === "never" ? 14 : 0, transactions >= 20 ? 6 : 0),
        whyFr: ["Ton besoin peut être couvert avec une structure de frais très simple."],
        whyEn: ["Your needs may fit a very simple fee structure."],
        watchFr: ["Vérifier accès aux guichets, dépôts comptant, traites bancaires et service en succursale."],
        watchEn: ["Check ATM access, cash deposits, bank drafts and in-branch service."],
        sourceIds: ["fcac-account-tool"],
      },
      {
        id: "bank-low-cost-branch",
        titleFr: "Compte à faible coût avec succursales",
        titleEn: "Low-cost account with branches",
        descriptionFr: "Compromis pour garder un accès physique sans payer pour un forfait très premium.",
        descriptionEn: "A compromise that preserves branch access without paying for a premium bundle.",
        matchScore: score(52, branch === "sometimes" ? 18 : 0, branch === "often" ? 16 : 0, fees === "low" ? 15 : 0),
        whyFr: ["Tu peux valoriser un accès occasionnel à une succursale."],
        whyEn: ["You may value occasional branch access."],
        watchFr: ["Comparer le nombre de transactions incluses et les critères d’exonération."],
        watchEn: ["Compare included transactions and fee-waiver conditions."],
        sourceIds: ["fcac-account-tool"],
      },
      {
        id: "bank-savings",
        titleFr: "Compte d’épargne à intérêt élevé",
        titleEn: "High-interest savings account",
        descriptionFr: "Pertinent si l’objectif principal est de rémunérer un solde qui n’est pas utilisé tous les jours.",
        descriptionEn: "Relevant when the main goal is earning interest on money not used every day.",
        matchScore: score(46, goal === "savings" ? 35 : goal === "both" ? 16 : 0),
        whyFr: ["Le rendement sur le solde devient plus important que le nombre de transactions."],
        whyEn: ["Interest on the balance matters more than transaction count."],
        watchFr: ["Comparer taux régulier, taux promotionnel, durée de la promotion et frais de retrait."],
        watchEn: ["Compare regular rate, promotional rate, promotion duration and withdrawal fees."],
        sourceIds: ["fcac-account-tool"],
      },
    ].sort((a, b) => b.matchScore - a.matchScore);
  }

  if (category === "mortgage") {
    const rateComfort = stringAnswer(answers, "rate_comfort");
    const horizon = stringAnswer(answers, "change_horizon");
    const buffer = stringAnswer(answers, "payment_buffer");

    return [
      {
        id: "mortgage-fixed-5",
        titleFr: "Taux fixe — terme plus long",
        titleEn: "Fixed rate — longer term",
        descriptionFr: "Piste axée sur la prévisibilité du paiement et du taux pendant le terme.",
        descriptionEn: "A path focused on payment and rate predictability during the term.",
        matchScore: score(52, rateComfort === "certainty" ? 24 : 0, buffer === "tight" ? 16 : 0, horizon === "stable" ? 9 : 0),
        whyFr: ["La stabilité peut avoir plus de valeur si une hausse de paiement serait difficile à absorber."],
        whyEn: ["Stability can be more valuable if a payment increase would be difficult to absorb."],
        watchFr: ["Comparer le taux, les privilèges de remboursement anticipé et surtout la méthode de calcul de la pénalité."],
        watchEn: ["Compare rate, prepayment privileges and especially how the penalty is calculated."],
        sourceIds: ["fcac-mortgage-tools"],
      },
      {
        id: "mortgage-fixed-3",
        titleFr: "Taux fixe — terme intermédiaire",
        titleEn: "Fixed rate — intermediate term",
        descriptionFr: "Compromis entre stabilité immédiate et possibilité de renégocier plus tôt.",
        descriptionEn: "A compromise between near-term stability and an earlier chance to renegotiate.",
        matchScore: score(55, rateComfort === "balanced" ? 23 : 0, horizon === "3to5" ? 18 : 0, buffer === "some" ? 7 : 0),
        whyFr: ["Cette structure peut convenir quand tu veux de la stabilité sans verrouiller trop longtemps."],
        whyEn: ["This structure may fit when you want stability without locking in for too long."],
        watchFr: ["Comparer taux, terme exact, portabilité et pénalité en cas de vente ou refinancement."],
        watchEn: ["Compare rate, exact term, portability and penalty if you sell or refinance."],
        sourceIds: ["fcac-mortgage-tools"],
      },
      {
        id: "mortgage-variable",
        titleFr: "Taux variable",
        titleEn: "Variable rate",
        descriptionFr: "Piste plus flexible, mais le coût peut évoluer avec les taux de marché.",
        descriptionEn: "A more flexible path, but cost can move with market rates.",
        matchScore: score(45, rateComfort === "flexibility" ? 32 : 0, buffer === "comfortable" ? 18 : 0, horizon === "under3" ? 10 : 0),
        whyFr: ["Cette piste devient plus cohérente si tu acceptes les variations et disposes d’une marge de paiement."],
        whyEn: ["This path becomes more coherent if you accept variability and have payment room."],
        watchFr: ["Vérifier fréquence d’ajustement, conversion vers fixe, déclencheurs de paiement et pénalités."],
        watchEn: ["Check reset frequency, conversion to fixed, payment triggers and penalties."],
        sourceIds: ["fcac-mortgage-tools"],
      },
    ].sort((a, b) => b.matchScore - a.matchScore);
  }

  if (category === "student_loan") {
    const aid = stringAnswer(answers, "government_aid");
    const style = stringAnswer(answers, "repayment_style");
    const cosigner = stringAnswer(answers, "cosigner");

    return [
      {
        id: "student-public-first",
        titleFr: "Aide gouvernementale d’abord",
        titleEn: "Government student aid first",
        descriptionFr: "Commencer par les prêts et bourses publics avant de combler le reste avec du crédit privé.",
        descriptionEn: "Start with public loans and grants before filling the remaining gap with private credit.",
        matchScore: score(62, aid === "not_checked" ? 26 : aid === "applied" ? 12 : -2),
        whyFr: ["Les modalités publiques peuvent être très différentes d’une marge bancaire."],
        whyEn: ["Public-program terms can differ significantly from a bank line of credit."],
        watchFr: ["Vérifier admissibilité provinciale/fédérale, bourses, période de grâce et modalités de remboursement."],
        watchEn: ["Check provincial/federal eligibility, grants, grace period and repayment terms."],
        sourceIds: ["fcac-student-credit"],
      },
      {
        id: "student-line",
        titleFr: "Marge de crédit étudiante",
        titleEn: "Student line of credit",
        descriptionFr: "Peut combler un manque résiduel et offrir de la flexibilité pendant les études.",
        descriptionEn: "Can fill a remaining gap and provide flexibility during school.",
        matchScore: score(48, aid === "maxed" ? 24 : 0, style === "flexible" ? 22 : 0, cosigner === "yes" ? 7 : 0),
        whyFr: ["Une marge peut être utile si le besoin est variable d’un trimestre à l’autre."],
        whyEn: ["A line can be useful when the funding need varies from term to term."],
        watchFr: ["Comparer taux variable, exigences de cosignataire, paiement d’intérêt pendant les études et conversion après diplomation."],
        watchEn: ["Compare variable rate, co-signer requirements, interest payments during school and conversion after graduation."],
        sourceIds: ["fcac-student-credit"],
      },
      {
        id: "student-fixed",
        titleFr: "Prêt amorti à paiement fixe",
        titleEn: "Fixed-payment installment loan",
        descriptionFr: "À comparer surtout si tu veux connaître précisément la mensualité et la date de fin.",
        descriptionEn: "Compare this if you mainly want a known monthly payment and payoff date.",
        matchScore: score(43, style === "fixed" ? 34 : 0),
        whyFr: ["La prévisibilité du remboursement est le principal avantage de cette structure."],
        whyEn: ["Repayment predictability is the main benefit of this structure."],
        watchFr: ["Comparer TAEG, frais, possibilité de remboursement anticipé et coût total."],
        watchEn: ["Compare APR, fees, prepayment terms and total cost."],
        sourceIds: ["fcac-student-credit"],
      },
    ].sort((a, b) => b.matchScore - a.matchScore);
  }

  if (category === "personal_loan") {
    const style = stringAnswer(answers, "repayment_style");
    const homeowner = stringAnswer(answers, "homeowner");
    const purpose = stringAnswer(answers, "loan_purpose");

    return [
      {
        id: "personal-installment",
        titleFr: "Prêt personnel à paiement fixe",
        titleEn: "Fixed-payment personal loan",
        descriptionFr: "Structure claire pour rembourser un montant déterminé sur une durée déterminée.",
        descriptionEn: "A clear structure for repaying a defined amount over a defined term.",
        matchScore: score(54, style === "fixed" ? 28 : 0, purpose === "consolidation" ? 10 : 0),
        whyFr: ["Le paiement fixe facilite le suivi et donne une date de fin à la dette."],
        whyEn: ["A fixed payment makes tracking easier and creates a defined payoff date."],
        watchFr: ["Comparer TAEG, frais initiaux, assurance facultative et pénalités."],
        watchEn: ["Compare APR, upfront fees, optional insurance and penalties."],
        sourceIds: ["fcac-personal-loans"],
      },
      {
        id: "personal-loc",
        titleFr: "Marge de crédit personnelle",
        titleEn: "Personal line of credit",
        descriptionFr: "Plus souple si le montant exact ou le calendrier de dépenses n’est pas encore connu.",
        descriptionEn: "More flexible when the exact amount or spending schedule is not yet known.",
        matchScore: score(46, style === "revolving" ? 33 : 0, purpose === "emergency" ? 12 : 0),
        whyFr: ["Tu paies généralement de l’intérêt seulement sur la portion utilisée, mais la dette n’a pas de date de fin automatique."],
        whyEn: ["You generally pay interest only on what you use, but the debt has no automatic end date."],
        watchFr: ["Comparer taux variable, paiement minimal et discipline de remboursement."],
        watchEn: ["Compare variable rate, minimum payment and repayment discipline."],
        sourceIds: ["fcac-personal-loans"],
      },
      {
        id: "personal-secured",
        titleFr: "Financement garanti / valeur domiciliaire",
        titleEn: "Secured / home-equity financing",
        descriptionFr: "À examiner seulement si tu es propriétaire et si le coût plus faible compense le risque de mettre un actif en garantie.",
        descriptionEn: "Consider only if you own a home and lower cost justifies putting an asset at risk.",
        matchScore: score(38, homeowner === "yes" ? 35 : -18, style === "lowest_cost" ? 15 : 0),
        whyFr: ["Une garantie peut réduire le coût du crédit, mais augmente les conséquences d’un défaut."],
        whyEn: ["Collateral can reduce borrowing cost but increases the consequences of default."],
        watchFr: ["Comparer frais juridiques/évaluation, taux, limite d’emprunt et risque lié à la garantie."],
        watchEn: ["Compare legal/appraisal fees, rate, borrowing limit and collateral risk."],
        sourceIds: ["fcac-personal-loans"],
      },
    ].sort((a, b) => b.matchScore - a.matchScore);
  }

  if (category === "auto_insurance") {
    const km = stringAnswer(answers, "annual_km");
    const deductible = stringAnswer(answers, "deductible_style");
    const bundle = stringAnswer(answers, "bundle");

    return [
      {
        id: "auto-multi-quote",
        titleFr: "Soumissions comparées à protection équivalente",
        titleEn: "Multiple quotes with equivalent coverage",
        descriptionFr: "La première piste est de comparer plusieurs assureurs avec exactement les mêmes protections et franchises.",
        descriptionEn: "The first path is comparing several insurers using the exact same coverage and deductibles.",
        matchScore: 92,
        whyFr: ["Une prime moins chère n’est utile que si la protection comparée est réellement équivalente."],
        whyEn: ["A cheaper premium only helps if the compared coverage is truly equivalent."],
        watchFr: ["Comparer responsabilité, collision, tous risques, franchises, exclusions et avenants."],
        watchEn: ["Compare liability, collision, comprehensive, deductibles, exclusions and endorsements."],
        sourceIds: ["fcac-insurance-shopping"],
      },
      {
        id: "auto-usage",
        titleFr: "Tarification faible kilométrage / usage",
        titleEn: "Low-mileage / usage-based pricing",
        descriptionFr: "À explorer si tu conduis peu et acceptes les conditions d’un programme lié à l’usage.",
        descriptionEn: "Explore this if you drive little and accept the conditions of a usage-based program.",
        matchScore: score(43, km === "under10" ? 35 : km === "10to20" ? 10 : -8),
        whyFr: ["Ton kilométrage déclaré peut rendre un modèle basé sur l’usage plus pertinent."],
        whyEn: ["Your reported mileage may make usage-based pricing more relevant."],
        watchFr: ["Vérifier données collectées, rabais réel, conditions et évolution de la prime."],
        watchEn: ["Check data collected, actual discount, conditions and premium changes."],
        sourceIds: ["fcac-insurance-shopping"],
      },
      {
        id: "auto-bundle",
        titleFr: "Regroupement auto + habitation",
        titleEn: "Auto + home bundle",
        descriptionFr: "Peut réduire la prime totale si tu as déjà une assurance habitation ou locataire.",
        descriptionEn: "May reduce total premium if you already have home or tenant insurance.",
        matchScore: score(44, bundle === "yes" ? 34 : -10, deductible === "balanced" ? 7 : 0),
        whyFr: ["Le rabais doit être évalué sur le coût combiné des deux polices."],
        whyEn: ["The discount should be evaluated on the combined cost of both policies."],
        watchFr: ["Comparer le total regroupé avec les deux meilleures offres séparées."],
        watchEn: ["Compare the bundled total with the two best separate offers."],
        sourceIds: ["fcac-insurance-shopping"],
      },
    ].sort((a, b) => b.matchScore - a.matchScore);
  }

  if (category === "life_insurance") {
    const horizon = stringAnswer(answers, "coverage_horizon");
    const need = stringAnswer(answers, "main_need");
    const budget = stringAnswer(answers, "budget_style");

    return [
      {
        id: "life-term-10",
        titleFr: "Assurance temporaire 10 ans",
        titleEn: "10-year term life insurance",
        descriptionFr: "Protection ciblée pour un besoin relativement court avec une prime initiale généralement plus simple à comparer.",
        descriptionEn: "Targeted protection for a relatively short need with an initial premium that is generally easier to compare.",
        matchScore: score(44, horizon === "10" ? 36 : 0, budget === "lowest" ? 16 : 0),
        whyFr: ["Le terme suit mieux un besoin temporaire qu’une protection conçue pour toute la vie."],
        whyEn: ["The term better follows a temporary need than lifetime coverage."],
        watchFr: ["Comparer renouvellement, conversion, exclusions et stabilité de la prime pendant le terme."],
        watchEn: ["Compare renewal, conversion, exclusions and premium stability during the term."],
        sourceIds: ["fcac-life-insurance"],
      },
      {
        id: "life-term-20-30",
        titleFr: "Assurance temporaire 20 à 30 ans",
        titleEn: "20–30 year term life insurance",
        descriptionFr: "Souvent cohérente avec remplacement de revenu, enfants à charge ou horizon hypothécaire.",
        descriptionEn: "Often aligned with income replacement, dependants or a mortgage horizon.",
        matchScore: score(50, horizon === "20_30" ? 32 : 0, need === "income" ? 14 : 0, need === "mortgage" ? 12 : 0),
        whyFr: ["La durée peut être alignée sur la période où le besoin financier est le plus important."],
        whyEn: ["The duration can align with the period when the financial need is greatest."],
        watchFr: ["Comparer montant assuré, terme, options de conversion et coût total des primes."],
        watchEn: ["Compare coverage amount, term, conversion options and total premium cost."],
        sourceIds: ["fcac-life-insurance"],
      },
      {
        id: "life-permanent",
        titleFr: "Protection permanente à analyser",
        titleEn: "Permanent coverage to analyze",
        descriptionFr: "À examiner surtout pour un besoin qui persiste toute la vie, pas simplement parce qu’elle accumule une valeur.",
        descriptionEn: "Consider mainly for a lifelong need, not simply because it can build value.",
        matchScore: score(36, horizon === "lifetime" ? 39 : 0, need === "estate" ? 22 : 0, budget === "permanent" ? 15 : 0),
        whyFr: ["Cette structure peut correspondre à un besoin permanent de succession ou de liquidité au décès."],
        whyEn: ["This structure may fit a permanent estate or end-of-life liquidity need."],
        watchFr: ["Comparer coûts, garanties, valeurs de rachat, hypothèses non garanties et conséquences d’une résiliation."],
        watchEn: ["Compare costs, guarantees, cash values, non-guaranteed assumptions and lapse consequences."],
        sourceIds: ["fcac-life-insurance"],
      },
    ].sort((a, b) => b.matchScore - a.matchScore);
  }

  const complexity = stringAnswer(answers, "tax_complexity");
  const help = stringAnswer(answers, "help_level");
  const budget = stringAnswer(answers, "tax_budget");
  const foreign = stringAnswer(answers, "foreign_assets");

  return [
    {
      id: "tax-free-certified",
      titleFr: "Logiciel homologué gratuit",
      titleEn: "Free certified tax software",
      descriptionFr: "À privilégier pour une situation simple si le logiciel couvre tes formulaires et ta province.",
      descriptionEn: "Prioritize for a simple return when the software covers your forms and province.",
      matchScore: score(56, complexity === "simple" ? 24 : 0, help === "diy" ? 13 : 0, budget === "free" ? 16 : 0),
      whyFr: ["Tu peux éviter des frais si ta situation est couverte sans sacrifier les formulaires nécessaires."],
      whyEn: ["You can avoid fees if your situation is covered without sacrificing required forms."],
      watchFr: [province === "QC" ? "Vérifier explicitement la prise en charge de la déclaration TP-1 du Québec." : "Vérifier les restrictions propres à la province et à l’année d’imposition."],
      watchEn: [province === "QC" ? "Explicitly verify support for Quebec’s TP-1 return." : "Check province- and tax-year-specific limitations."],
      sourceIds: ["cra-tax-software"],
    },
    {
      id: "tax-guided",
      titleFr: "Logiciel homologué avec accompagnement",
      titleEn: "Certified software with guided help",
      descriptionFr: "Pour une déclaration plus complexe ou si tu veux davantage d’explications pendant la saisie.",
      descriptionEn: "For a more complex return or when you want more guidance while filing.",
      matchScore: score(48, help === "guided" ? 31 : 0, complexity !== "simple" ? 12 : 0, foreign === "yes" ? 8 : 0),
      whyFr: ["L’accompagnement peut réduire le risque d’oublier des sections pertinentes, mais il faut toujours vérifier les limites du produit."],
      whyEn: ["Guidance can reduce the risk of missing relevant sections, but product limitations still need verification."],
      watchFr: ["Comparer coût final, T1135, ReFILE, travail autonome, placements et support Québec si applicable."],
      watchEn: ["Compare final price, T1135, ReFILE, self-employment, investments and Quebec support if applicable."],
      sourceIds: ["cra-tax-software"],
    },
    {
      id: "tax-pro",
      titleFr: "Préparateur fiscal / CPA à considérer",
      titleEn: "Tax preparer / CPA to consider",
      descriptionFr: "Une piste à considérer si plusieurs éléments complexes s’additionnent ou si tu veux déléguer la préparation.",
      descriptionEn: "A path to consider when multiple complex elements overlap or when you want to delegate preparation.",
      matchScore: score(35, help === "pro" ? 43 : 0, complexity === "complex" ? 29 : complexity === "rental" ? 18 : 0),
      whyFr: ["Plus les enjeux sont complexes, plus la valeur d’un regard professionnel peut augmenter."],
      whyEn: ["The more complex the issues, the more valuable professional review can become."],
      watchFr: ["Vérifier qualifications, portée du mandat, responsabilité, prix et documents à fournir."],
      watchEn: ["Verify qualifications, scope, responsibility, price and required documents."],
      sourceIds: ["cra-tax-software"],
    },
  ].sort((a, b) => b.matchScore - a.matchScore);
}

export function shoppingSourceById(id: string) {
  return SHOPPING_SOURCES.find((source) => source.id === id) ?? null;
}
