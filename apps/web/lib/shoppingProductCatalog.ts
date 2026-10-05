import type { ShoppingCategoryId } from "@/lib/shopping";
import type { ShoppingAnswers } from "@/lib/shoppingWizard";

export type ProductDataMode = "published" | "partial" | "live_rate" | "quote" | "registry";

export type ShoppingProduct = {
  category: ShoppingCategoryId;
  issuer: string;
  issuerKey: string;
  name: string;
  kindFr: string;
  kindEn: string;
  summaryFr: string;
  summaryEn: string;
  annualFee: number | null;
  monthlyFee: number | null;
  minimumBalance: number | null;
  transactions: number | null;
  purchaseRate: number | null;
  incomePersonal: number | null;
  incomeHousehold: number | null;
  rateSpread: number | null;
  metricsFr: string[];
  metricsEn: string[];
  tags: string[];
  provinces: string[] | null;
  dataMode: ProductDataMode;
  sourceUrl: string;
  sourceLabel: string;
  sourceNoteFr: string | null;
  sourceNoteEn: string | null;
  verifiedAt: string;
};

export type ShoppingProductMatch = {
  product: ShoppingProduct;
  matchScore: number;
  reasonsFr: string[];
  reasonsEn: string[];
  cautionsFr: string[];
  cautionsEn: string[];
};

// Positional rows preserve all 70 published records while avoiding repeated keys in the web JS budget.
const CATALOG_FIELDS = ["category","issuer","issuerKey","name","kindFr","kindEn","summaryFr","summaryEn","annualFee","purchaseRate","metricsFr","metricsEn","tags","dataMode","sourceUrl","sourceLabel","monthlyFee","minimumBalance","transactions","incomePersonal","incomeHousehold","rateSpread","provinces","sourceNoteFr","sourceNoteEn","verifiedAt"] as const;
export const SHOPPING_PRODUCT_CATALOG: ShoppingProduct[] = (() => {
  const rows: unknown[][] = [["credit_card","RBC","rbc","RBC Cash Back Mastercard","Carte de remises","Cash-back card","Remises quotidiennes sans frais annuels.","Everyday cash back with no annual fee.",0,20.99,["0 $ / an","20,99 % achats","Remises en argent"],["$0 / year","20.99% purchases","Cash back"],["cashback","no_fee","everyday"],"published","https://www.rbcroyalbank.com/fr/cartes/index.html","RBC",null,null,null,null,null,null,null,null,null,"2026-09-24"],["credit_card","RBC","rbc","RBC Visa Classic Low Rate Option","Carte à faible taux","Low-rate card","Structure de crédit axée sur un taux d’achat réduit.","Credit structure focused on a lower purchase rate.",20,12.99,["20 $ / an","12,99 % achats","Faible taux"],["$20 / year","12.99% purchases","Low rate"],["low_rate"],"published","https://www.rbcroyalbank.com/credit-cards/cardholders/additional-documents/rbc-credit-card-agreement-changes-1125.pdf","RBC",null,null,null,null,null,null,null,null,null,"2026-09-24"],["credit_card","RBC","rbc","RBC Avion Visa Infinite","Carte voyage","Travel card","Points Avion, voyage et protections étendues.","Avion points, travel and broader insurance.",120,20.99,["120 $ / an","20,99 % achats","Points Avion"],["$120 / year","20.99% purchases","Avion points"],["points","travel","insurance"],"published","https://www.rbcroyalbank.com/fr/cartes/voyages/avion-visa-infinite-rbc.html","RBC",null,null,null,60000,100000,null,null,null,null,"2026-09-24"],["credit_card","TD","td","TD Cash Back Visa","Carte de remises","Cash-back card","Remises sur plusieurs dépenses courantes sans frais annuels.","Cash back on several everyday categories with no annual fee.",0,21.99,["0 $ / an","21,99 % achats","Remises"],["$0 / year","21.99% purchases","Cash back"],["cashback","no_fee","grocery","gas","transit","bills","streaming"],"published","https://www.td.com/ca/fr/services-bancaires-personnels/produits/cartes-de-credit/remises/carte-visa-remises","TD",null,null,null,null,null,null,null,null,null,"2026-09-24"],["credit_card","Scotiabank","scotia","Scotiabank Scene+ Visa","Carte de points","Points card","Points Scene+ sur plusieurs dépenses courantes, sans frais annuels.","Scene+ points on everyday spending with no annual fee.",0,21.99,["0 $ / an","21,99 % achats","Points Scene+"],["$0 / year","21.99% purchases","Scene+ points"],["points","no_fee","grocery","everyday","scene"],"published","https://www.scotiabank.com/ca/fr/particuliers/cartes-de-credit/visa/carte-scene.html","Scotiabank",null,null,null,null,null,null,null,null,null,"2026-09-24"],["credit_card","Scotiabank","scotia","Scotiabank Passport Visa Infinite+","Carte voyage premium","Premium travel card","Voyage, protections, accès salon et absence de frais de conversion de devises.","Travel, insurance, lounge access and no foreign transaction fee.",150,20.99,["150 $ / an","20,99 % achats","Voyage + sans frais FX"],["$150 / year","20.99% purchases","Travel + no FX fee"],["points","travel","insurance","no_fx","grocery","dining","transit","scene"],"published","https://www.scotiabank.com/ca/fr/particuliers/cartes-de-credit/visa/carte-infinite-passeport.html","Scotiabank",null,null,null,60000,100000,null,null,null,null,"2026-09-24"],["credit_card","BMO","bmo","BMO CashBack Mastercard","Carte de remises","Cash-back card","Remises bonifiées sur l’épicerie et les paiements récurrents, sans frais annuels.","Enhanced grocery and recurring-bill cash back with no annual fee.",0,null,["0 $ / an","Taux à vérifier","Remises"],["$0 / year","Verify rate","Cash back"],["cashback","no_fee","grocery","bills"],"partial","https://www.bmo.com/principal/particuliers/cartes-de-credit/bmo-remises-mastercard/","BMO",null,null,null,null,null,null,null,null,null,"2026-09-24"],["credit_card","BMO","bmo","BMO CashBack World Elite Mastercard","Carte de remises premium","Premium cash-back card","Remises élevées dans plusieurs catégories courantes et protections additionnelles.","Higher cash back across everyday categories with additional insurance.",139,null,["139 $ / an","Taux à vérifier","Remises premium"],["$139 / year","Verify rate","Premium cash back"],["cashback","grocery","transit","gas","bills","insurance"],"partial","https://www.bmo.com/en-ca/main/personal/credit-cards/bmo-cashback-world-elite-mastercard/","BMO",null,null,null,80000,150000,null,null,null,null,"2026-09-24"],["credit_card","CIBC","cibc","CIBC Dividend Visa","Carte de remises","Cash-back card","Remises sur l’épicerie et plusieurs dépenses courantes, sans frais annuels.","Cash back on groceries and several everyday categories with no annual fee.",0,21.99,["0 $ / an","21,99 % achats","Remises"],["$0 / year","21.99% purchases","Cash back"],["cashback","no_fee","grocery","gas","transit","dining","bills"],"published","https://www.cibc.com/fr/personal-banking/credit-cards/all-credit-cards/dividend-visa-card.html","CIBC",null,null,null,null,15000,null,null,null,null,"2026-09-24"],["credit_card","CIBC","cibc","CIBC Select Visa","Carte à faible taux","Low-rate card","Taux d’achat réduit pour les utilisateurs qui reportent un solde.","Lower purchase rate for users who carry a balance.",29,13.99,["29 $ / an","13,99 % achats","Faible taux"],["$29 / year","13.99% purchases","Low rate"],["low_rate"],"published","https://www.cibc.com/fr/personal-banking/credit-cards/all-credit-cards/select-visa-card.html","CIBC",null,null,null,null,15000,null,null,null,null,"2026-09-24"],["credit_card","Desjardins","desjardins","Desjardins Flexi Visa","Carte à faible taux","Low-rate card","Faible taux d’achat sans frais annuels.","Low purchase rate with no annual fee.",0,10.9,["0 $ / an","10,9 % achats","Faible taux"],["$0 / year","10.9% purchases","Low rate"],["low_rate","no_fee"],"published","https://www.desjardins.com/ca/personal/loans-credit/credit-cards/flexi-visa/index.jsp","Desjardins",null,null,null,null,null,null,null,null,null,"2026-09-24"],["credit_card","Desjardins","desjardins","Desjardins Cash Back Visa","Carte de remises","Cash-back card","Remises sur plusieurs catégories sans frais annuels.","Cash back across multiple categories with no annual fee.",0,20.9,["0 $ / an","20,9 % achats","Remises"],["$0 / year","20.9% purchases","Cash back"],["cashback","no_fee","dining","transit","bills","insurance"],"published","https://www.desjardins.com/fr/cartes-credit/remises-visa.html","Desjardins",null,null,null,null,null,null,null,null,null,"2026-09-24"],["credit_card","Tangerine","tangerine","Tangerine Money-Back Credit Card","Carte de remises","Cash-back card","Catégories de remises choisies par l’utilisateur, sans frais annuels.","User-selected cash-back categories with no annual fee.",0,20.95,["0 $ / an","20,95 % achats","Catégories au choix"],["$0 / year","20.95% purchases","Choose categories"],["cashback","no_fee","grocery","dining","gas","transit","bills","everyday"],"published","https://www.tangerine.ca/fr/particuliers/depenses/cartes-de-credit/carte-remises","Tangerine",null,null,null,12000,null,null,null,null,null,"2026-09-24"],["credit_card","Rogers Bank","rogers","Rogers Red World Mastercard","Carte de remises","Cash-back card","Remises bonifiées pour certains clients des services Rogers/Fido/Shaw/Comwave.","Enhanced cash back for some Rogers/Fido/Shaw/Comwave service customers.",0,21.99,["0 $ / an","21,99 % achats","Remises Rogers"],["$0 / year","21.99% purchases","Rogers cash back"],["cashback","no_fee","everyday","rogers"],"published","https://www.rogersbank.com/fr/rogers_red_world_mastercard_details/","Rogers Bank",null,null,null,50000,80000,null,null,null,null,"2026-09-24"],["credit_card","PC Financial","pc","PC Mastercard","Carte de points détaillant","Retail rewards card","Points PC Optimum dans l’écosystème Loblaw/Pharmaprix/Esso/Mobil.","PC Optimum points across Loblaw/Shoppers/Esso/Mobil.",0,21.99,["0 $ / an","21,99 % achats","PC Optimum"],["$0 / year","21.99% purchases","PC Optimum"],["points","retail","no_fee","grocery","gas","pc"],"published","https://www.pcfinancial.ca/fr/credit-cards/pc-mastercard/","PC Financial",null,null,null,null,null,null,null,null,null,"2026-09-24"],["credit_card","Canadian Tire Bank","triangle","Triangle Mastercard","Carte de récompenses détaillant","Retail rewards card","Argent Canadian Tire et avantages du réseau Triangle, sans frais annuels.","Canadian Tire Money and Triangle-network benefits with no annual fee.",0,21.99,["0 $ / an","21,99 % achats*","Argent CT"],["$0 / year","21.99% purchases*","CT Money"],["points","retail","no_fee","gas"],"published","https://www.ctfs.com/content/ctfs3/fr/credit-cards.html","Canadian Tire Bank",null,null,null,null,null,null,null,null,null,"2026-09-24"],["credit_card","MBNA","mbna","MBNA True Line Gold Mastercard","Carte à faible taux","Low-rate card","Taux réduit pour les résidents du Québec selon la page MBNA.","Lower rate for Quebec residents according to MBNA.",39,10.99,["39 $ / an","10,99 % achats (QC)","Faible taux"],["$39 / year","10.99% purchases (QC)","Low rate"],["low_rate"],"published","https://www.mbna.ca/fr/cartes-de-credit/comparer-cartes-de-credit/quebec","MBNA",null,null,null,null,null,null,["QC"],null,null,"2026-09-24"],["credit_card","American Express","amex","American Express Cobalt Card","Carte de points","Points card","Multiplicateurs élevés sur repas, épicerie, diffusion, essence et transport.","High earn multipliers on eats, groceries, streaming, gas and transit.",191.88,21.99,["191,88 $ / an","21,99 % achats","Membership Rewards"],["$191.88 / year","21.99% purchases","Membership Rewards"],["points","travel","grocery","dining","streaming","gas","transit","insurance"],"published","https://www.americanexpress.com/ca/fr/cartes-de-credit/toutes-les-cartes/","American Express",null,null,null,null,null,null,null,null,null,"2026-09-24"],["credit_card","National Bank","nbc","National Bank Platinum Mastercard","Carte de points","Points card","Points, protections voyage et assurance appareil mobile.","Points, travel coverage and mobile-device insurance.",70,null,["70 $ / an","Taux à vérifier","Points + assurances"],["$70 / year","Verify rate","Points + insurance"],["points","travel","insurance"],"partial","https://www.nbc.ca/particuliers/cartes-credit/mastercard/platine.html","National Bank",null,null,null,null,null,null,null,null,null,"2026-09-24"],["banking","Tangerine","tangerine","Tangerine No-Fee Daily Chequing","Compte chèques numérique","Digital chequing account","Aucuns frais mensuels, transactions quotidiennes illimitées et virements Interac inclus.","No monthly fee, unlimited daily transactions and included Interac e-Transfers.",null,null,["0 $ / mois","Transactions illimitées","Numérique"],["$0 / month","Unlimited transactions","Digital"],["no_fee","unlimited","digital","etransfer"],"published","https://www.tangerine.ca/en/personal/spend/chequing-account","Tangerine",0,0,9999,null,null,null,null,null,null,"2026-09-24"],["banking","Simplii Financial","simplii","Simplii No Fee Chequing Account","Compte chèques numérique","Digital chequing account","Aucuns frais mensuels, opérations courantes illimitées et accès aux GAB CIBC.","No monthly fee, unlimited daily banking and CIBC ATM access.",null,null,["0 $ / mois","Transactions illimitées","GAB CIBC"],["$0 / month","Unlimited transactions","CIBC ATMs"],["no_fee","unlimited","digital","etransfer"],"published","https://www.simplii.com/en/bank-accounts/no-fee-chequing.html","Simplii",0,0,9999,null,null,null,null,null,null,"2026-09-24"],["banking","TD","td","TD Unlimited Chequing Account","Compte chèques avec succursales","Branch chequing account","Transactions illimitées et exonération de frais avec le solde minimal publié.","Unlimited transactions with a fee waiver at the published minimum balance.",null,null,["17,95 $ / mois","0 $ avec 4 000 $","Illimité"],["$17.95 / month","$0 with $4,000","Unlimited"],["branch","unlimited","etransfer","fee_waiver"],"published","https://www.td.com/ca/en/personal-banking/products/bank-accounts/chequing-accounts/unlimited-chequing-account/","TD",17.95,4000,9999,null,null,null,null,null,null,"2026-09-24"],["banking","Scotiabank","scotia","Scotiabank Preferred Package","Forfait bancaire","Banking package","Transactions illimitées, Scene+ et exonération avec solde minimal publié.","Unlimited transactions, Scene+ and a published balance-based fee waiver.",null,null,["16,95 $ / mois","0 $ avec 4 000 $","Illimité"],["$16.95 / month","$0 with $4,000","Unlimited"],["branch","unlimited","etransfer","fee_waiver","scene"],"published","https://www.scotiabank.com/ca/en/personal/bank-accounts/chequing-accounts/preferred.html","Scotiabank",16.95,4000,9999,null,null,null,null,null,null,"2026-09-24"],["banking","BMO","bmo","BMO Performance Chequing Account","Forfait bancaire","Banking package","Transactions illimitées et exonération avec solde minimal publié.","Unlimited transactions with a published balance-based fee waiver.",null,null,["17,95 $ / mois","0 $ avec 4 000 $","Illimité"],["$17.95 / month","$0 with $4,000","Unlimited"],["branch","unlimited","etransfer","fee_waiver"],"published","https://www.bmo.com/en-ca/main/personal/bank-accounts/chequing-accounts/performance/","BMO",17.95,4000,9999,null,null,null,null,null,null,"2026-09-24"],["banking","Desjardins","desjardins","Desjardins Unlimited Plan","Forfait compte courant","Everyday account plan","Transactions illimitées et exonération avec le solde minimal publié.","Unlimited transactions with the published minimum-balance fee waiver.",null,null,["15,95 $ / mois","0 $ avec 4 000 $","Illimité"],["$15.95 / month","$0 with $4,000","Unlimited"],["branch","unlimited","fee_waiver"],"published","https://www.desjardins.com/en/accounts-services/everyday-account.html","Desjardins",15.95,4000,9999,null,null,null,null,null,null,"2026-09-24"],["banking","RBC","rbc","RBC Day-to-Day Banking","Compte quotidien","Everyday chequing account","Option bancaire de base avec accès au réseau RBC.","Basic everyday banking with RBC network access.",null,null,["Frais à vérifier","Réseau RBC","Compte quotidien"],["Verify fees","RBC network","Everyday account"],["branch"],"partial","https://www.rbcroyalbank.com/accounts/","RBC",null,null,null,null,null,null,null,null,null,"2026-09-24"],["banking","CIBC","cibc","CIBC Smart Account","Compte chèques","Chequing account","Compte quotidien avec réseau de succursales et services numériques CIBC.","Everyday chequing with CIBC branch and digital access.",null,null,["Frais à vérifier","Réseau CIBC","Compte quotidien"],["Verify fees","CIBC network","Everyday account"],["branch","digital"],"partial","https://www.cibc.com/en/personal-banking/bank-accounts/chequing-accounts.html","CIBC",null,null,null,null,null,null,null,null,null,"2026-09-24"],["banking","National Bank","nbc","National Bank Chequing Accounts","Compte chèques","Chequing account","Gamme de forfaits bancaires avec services en succursale et numériques.","Range of banking packages with branch and digital service.",null,null,["Frais à vérifier","Succursales + numérique","Plusieurs forfaits"],["Verify fees","Branch + digital","Multiple plans"],["branch","digital"],"partial","https://www.nbc.ca/personal/accounts.html","National Bank",null,null,null,null,null,null,null,null,null,"2026-09-24"],["mortgage","RBC","rbc","RBC Fixed / Variable Mortgages","Prêts hypothécaires","Mortgages","Solutions fixes et variables; le taux offert doit être vérifié en temps réel.","Fixed and variable solutions; offered rates must be verified live.",null,null,["Fixe + variable","Taux en direct","Préapprobation"],["Fixed + variable","Live rate","Pre-approval"],["fixed","variable","closed","prepayment","branch","refinance"],"live_rate","https://www.rbcroyalbank.com/mortgages/","RBC",null,null,null,null,null,null,null,null,null,"2026-09-24"],["mortgage","TD","td","TD Fixed / Variable Mortgages","Prêts hypothécaires","Mortgages","Taux fixe sur plusieurs termes, variable fermé et variable ouvert.","Fixed terms plus closed and open variable mortgage options.",null,null,["Fixe 6 mois à 10 ans","Variable 5 ans","Prépaiement"],["Fixed 6 months–10 years","5-year variable","Prepayment"],["fixed","variable","open","closed","prepayment","branch","refinance"],"live_rate","https://www.td.com/ca/en/personal-banking/products/mortgages/td-mortgage-products","TD",null,null,null,null,null,null,null,null,null,"2026-09-24"],["mortgage","Scotiabank","scotia","Scotiabank Mortgages","Prêts hypothécaires","Mortgages","Solutions d’achat, renouvellement et refinancement avec taux à vérifier en direct.","Purchase, renewal and refinance solutions with rates to verify live.",null,null,["Fixe + variable","Taux en direct","Achat / renouvellement"],["Fixed + variable","Live rate","Purchase / renewal"],["fixed","variable","closed","prepayment","branch","refinance"],"live_rate","https://www.scotiabank.com/ca/en/personal/mortgages.html","Scotiabank",null,null,null,null,null,null,null,null,null,"2026-09-24"],["mortgage","BMO","bmo","BMO Mortgages","Prêts hypothécaires","Mortgages","Solutions hypothécaires fixes et variables avec taux public changeant.","Fixed and variable mortgages with changing public rates.",null,null,["Fixe + variable","Taux en direct","Réseau BMO"],["Fixed + variable","Live rate","BMO network"],["fixed","variable","closed","prepayment","branch","refinance"],"live_rate","https://www.bmo.com/en-ca/main/personal/mortgages/","BMO",null,null,null,null,null,null,null,null,null,"2026-09-24"],["mortgage","CIBC","cibc","CIBC Mortgages","Prêts hypothécaires","Mortgages","Hypothèques pour achat, renouvellement et refinancement.","Mortgages for purchase, renewal and refinance.",null,null,["Fixe + variable","Taux en direct","Achat / refinancement"],["Fixed + variable","Live rate","Purchase / refinance"],["fixed","variable","closed","prepayment","branch","refinance"],"live_rate","https://www.cibc.com/en/personal-banking/mortgages.html","CIBC",null,null,null,null,null,null,null,null,null,"2026-09-24"],["mortgage","Desjardins","desjardins","Desjardins Mortgages","Prêts hypothécaires","Mortgages","Solutions fixes et variables disponibles au Québec et dans les marchés servis.","Fixed and variable solutions in Quebec and served markets.",null,null,["Fixe + variable","Taux en direct","Accompagnement"],["Fixed + variable","Live rate","Advisory"],["fixed","variable","closed","prepayment","branch","refinance"],"live_rate","https://www.desjardins.com/ca/personal/loans-credit/mortgages/","Desjardins",null,null,null,null,null,null,null,null,null,"2026-09-24"],["mortgage","National Bank","nbc","National Bank Mortgages","Prêts hypothécaires","Mortgages","Prêts hypothécaires avec options de taux et de remboursement à valider à la source.","Mortgage options with rates and repayment features to verify at source.",null,null,["Fixe + variable","Taux en direct","Réseau BNC"],["Fixed + variable","Live rate","NBC network"],["fixed","variable","closed","prepayment","branch","refinance"],"live_rate","https://www.nbc.ca/personal/mortgages.html","National Bank",null,null,null,null,null,null,null,null,null,"2026-09-24"],["student_loan","TD","td","TD Student Line of Credit","Marge étudiante","Student line of credit","Crédit renouvelable pour étudiants; conditions selon le programme d’études.","Revolving credit for students; terms vary by program.",null,null,["TD Prime + 1,50 %*","Jusqu’à 80 000 $ selon programme","Capital différé"],["TD Prime + 1.50%*","Up to $80,000 by program","Deferred principal"],["student_loc","variable","flexible","interest_only","undergrad","graduate","professional"],"published","https://www.td.com/ca/en/personal-banking/products/loans-and-lines-of-credit/student-borrowing/student-line-of-credit","TD",null,null,null,null,null,1.5,null,null,null,"2026-09-24"],["student_loan","Scotiabank","scotia","ScotiaLine Personal Line of Credit for Students","Marge étudiante","Student line of credit","Marge étudiante à taux variable avec paiement d’intérêt pendant les études.","Variable-rate student line with interest payments during school.",null,null,["Prime Scotia + 0,50 %*","Jusqu’à 80 000 $ premier cycle","12 mois de grâce capital"],["Scotia Prime + 0.50%*","Up to $80,000 undergraduate","12-month principal grace"],["student_loc","variable","flexible","interest_only","undergrad"],"published","https://www.scotiabank.com/ca/en/personal/loans-lines/line-of-credit/scotialine-personal-line-of-credit-students.html","Scotiabank",null,null,null,null,null,0.5,null,null,null,"2026-09-24"],["student_loan","Scotiabank","scotia","Scotia Professional Student Plan Line of Credit","Marge professions libérales","Professional student line of credit","Marge conçue pour certains programmes professionnels avec limite élevée.","Line of credit for eligible professional programs with a higher limit.",null,null,["Jusqu’à 400 000 $*","Grâce jusqu’à 24 mois","Sans frais mensuels/annuels"],["Up to $400,000*","Grace up to 24 months","No monthly/annual fee"],["student_loc","variable","flexible","professional","high_limit"],"published","https://www.scotiabank.com/ca/en/business-banking/banking-solutions/line-of-credit/spsp-line-of-credit.html","Scotiabank",null,null,null,null,null,null,null,null,null,"2026-09-24"],["student_loan","RBC","rbc","RBC Royal Credit Line for Students","Marge étudiante","Student line of credit","Marge pour financer études et dépenses, avec période de grâce après les études.","Student line for school and living costs with a post-study grace period.",null,null,["Taux à vérifier","Crédit renouvelable","Grâce 24 mois*"],["Verify rate","Revolving credit","24-month grace*"],["student_loc","variable","flexible","interest_only","undergrad","graduate"],"partial","https://www.rbcroyalbank.com/en-ca/my-money-matters/money-academy/credit-and-borrowing/understanding-loans/what-you-need-to-know-about-student-lines-of-credit-in-canada/","RBC",null,null,null,null,null,null,null,null,null,"2026-09-24"],["student_loan","CIBC","cibc","CIBC Education Line of Credit","Marge étudiante","Education line of credit","Financement étudiant à conditions variables selon le programme et le profil.","Student financing with terms that vary by program and profile.",null,null,["Taux personnalisé","Crédit renouvelable","Programme étudiant"],["Personalized rate","Revolving credit","Student program"],["student_loc","variable","flexible","undergrad","graduate","professional"],"quote","https://www.cibc.com/en/student/student-lines-of-credit.html","CIBC",null,null,null,null,null,null,null,null,null,"2026-09-24"],["student_loan","BMO","bmo","BMO Student Line of Credit","Marge étudiante","Student line of credit","Marge de crédit destinée aux études, tarification selon profil et programme.","Student line of credit priced according to profile and program.",null,null,["Taux personnalisé","Crédit renouvelable","Études postsecondaires"],["Personalized rate","Revolving credit","Post-secondary"],["student_loc","variable","flexible","undergrad","graduate"],"quote","https://www.bmo.com/main/personal/loans-line-of-credit/student-borrowing/","BMO",null,null,null,null,null,null,null,null,null,"2026-09-24"],["student_loan","National Bank","nbc","National Bank Student Line of Credit","Marge étudiante","Student line of credit","Marge de crédit pour étudiants avec conditions selon domaine d’études.","Student line of credit with terms based on field of study.",null,null,["Taux personnalisé","Crédit renouvelable","Plusieurs programmes"],["Personalized rate","Revolving credit","Multiple programs"],["student_loc","variable","flexible","undergrad","graduate","professional"],"quote","https://www.nbc.ca/personal/borrowing/student-line-credit.html","National Bank",null,null,null,null,null,null,null,null,null,"2026-09-24"],["personal_loan","RBC","rbc","RBC Personal Loan","Prêt personnel","Personal loan","Prêt amorti; taux et montant sont déterminés lors de la demande.","Installment loan; rate and amount are determined during application.",null,null,["Paiement fixe possible","Taux personnalisé","Montant selon approbation"],["Fixed payment available","Personalized rate","Amount by approval"],["fixed","installment","branch"],"quote","https://www.rbcroyalbank.com/personal-loans/","RBC",null,null,null,null,null,null,null,null,null,"2026-09-24"],["personal_loan","TD","td","TD Personal Loan","Prêt personnel","Personal loan","Prêt amorti pour financer une dépense ou consolider une dette.","Installment loan for purchases or debt consolidation.",null,null,["Paiement fixe","Taux personnalisé","Terme à choisir"],["Fixed payment","Personalized rate","Choose a term"],["fixed","installment","consolidation","branch"],"quote","https://www.td.com/ca/en/personal-banking/products/borrowing/loans","TD",null,null,null,null,null,null,null,null,null,"2026-09-24"],["personal_loan","Scotiabank","scotia","Scotia Personal Loan","Prêt personnel","Personal loan","Financement amorti avec conditions déterminées selon le dossier.","Installment financing with terms determined by the application.",null,null,["Paiement fixe","Taux personnalisé","Consolidation possible"],["Fixed payment","Personalized rate","Consolidation use"],["fixed","installment","consolidation","branch"],"quote","https://www.scotiabank.com/ca/en/personal/loans-lines/personal-loan.html","Scotiabank",null,null,null,null,null,null,null,null,null,"2026-09-24"],["personal_loan","BMO","bmo","BMO Personal Loan","Prêt personnel","Personal loan","Prêt pour projet, dépense ou consolidation avec tarification personnalisée.","Loan for a project, expense or consolidation with personalized pricing.",null,null,["Paiement fixe","Taux personnalisé","Projet / consolidation"],["Fixed payment","Personalized rate","Project / consolidation"],["fixed","installment","consolidation","branch"],"quote","https://www.bmo.com/main/personal/loans-line-of-credit/loans/","BMO",null,null,null,null,null,null,null,null,null,"2026-09-24"],["personal_loan","CIBC","cibc","CIBC Personal Loan","Prêt personnel","Personal loan","Prêt amorti dont le taux dépend du profil de crédit et des modalités.","Installment loan with pricing based on credit profile and terms.",null,null,["Paiement fixe","Taux personnalisé","Montant selon approbation"],["Fixed payment","Personalized rate","Amount by approval"],["fixed","installment","branch"],"quote","https://www.cibc.com/en/personal-banking/loans-and-lines-of-credit/personal-loans.html","CIBC",null,null,null,null,null,null,null,null,null,"2026-09-24"],["personal_loan","Desjardins","desjardins","Desjardins Personal Loan","Prêt personnel","Personal loan","Prêt amorti pour projet ou consolidation, avec conditions personnalisées.","Installment loan for projects or consolidation with personalized terms.",null,null,["Paiement fixe","Taux personnalisé","Projet / consolidation"],["Fixed payment","Personalized rate","Project / consolidation"],["fixed","installment","consolidation","branch"],"quote","https://www.desjardins.com/ca/personal/loans-credit/personal-loans/","Desjardins",null,null,null,null,null,null,null,null,null,"2026-09-24"],["personal_loan","National Bank","nbc","National Bank Personal Loan","Prêt personnel","Personal loan","Prêt amorti avec remboursement planifié et taux à confirmer lors de la demande.","Installment loan with scheduled repayment and a rate confirmed at application.",null,null,["Paiement fixe","Taux personnalisé","Réseau BNC"],["Fixed payment","Personalized rate","NBC network"],["fixed","installment","branch"],"quote","https://www.nbc.ca/personal/borrowing/personal-loan.html","National Bank",null,null,null,null,null,null,null,null,null,"2026-09-24"],["auto_insurance","Desjardins Insurance","desjardins","Desjardins Auto Insurance","Assurance automobile","Auto insurance","Soumission en ligne avec protections obligatoires et optionnelles.","Online quote with required and optional coverages.",null,null,["Prime personnalisée","Soumission en ligne","Options Ajusto"],["Personalized premium","Online quote","Ajusto options"],["online_quote","usage","bundle","digital","qc"],"quote","https://www.desjardins.com/en/insurance/auto.html","Desjardins",null,null,null,null,null,null,null,null,null,"2026-09-24"],["auto_insurance","TD Insurance","td","TD Auto Insurance","Assurance automobile","Auto insurance","Soumission en ligne et protections adaptées aux règles provinciales.","Online quote and coverage adapted to provincial rules.",null,null,["Prime personnalisée","Soumission en ligne","Rabais regroupement"],["Personalized premium","Online quote","Bundle discounts"],["online_quote","bundle","digital","qc"],"quote","https://www.tdinsurance.com/products-services/auto-car-insurance","TD Insurance",null,null,null,null,null,null,null,null,null,"2026-09-24"],["auto_insurance","CAA-Quebec","caa","CAA-Quebec Auto Insurance","Assurance automobile","Auto insurance","Produit offert au Québec avec avantages additionnels pour les membres CAA.","Quebec auto insurance with additional benefits for CAA members.",null,null,["Prime personnalisée","Québec","Avantages membres"],["Personalized premium","Quebec","Member benefits"],["online_quote","bundle","membership","qc"],"quote","https://www.caaquebec.com/en/insurance/vehicle/auto-insurance","CAA-Quebec",null,null,null,null,null,null,["QC"],null,null,"2026-09-24"],["auto_insurance","Beneva","beneva","Beneva Car Insurance","Assurance automobile","Auto insurance","Soumission automobile avec options de couverture et rabais de regroupement.","Auto quote with coverage options and bundling discounts.",null,null,["Prime personnalisée","Soumission en ligne","Regroupement"],["Personalized premium","Online quote","Bundling"],["online_quote","bundle","digital","qc"],"quote","https://www.beneva.ca/en/car-insurance","Beneva",null,null,null,null,null,null,null,null,null,"2026-09-24"],["auto_insurance","Intact","intact","Intact Auto Insurance","Assurance automobile","Auto insurance","Protection automobile distribuée au Canada avec tarification par profil.","Canadian auto coverage priced to the driver profile.",null,null,["Prime personnalisée","Protections variables","Canada"],["Personalized premium","Variable coverage","Canada"],["bundle","broker","digital"],"quote","https://www.intact.ca/","Intact",null,null,null,null,null,null,null,null,null,"2026-09-24"],["auto_insurance","belairdirect","belair","belairdirect Auto Insurance","Assurance automobile numérique","Digital auto insurance","Soumission et gestion numériques, selon la province et le profil.","Digital quoting and policy management depending on province and profile.",null,null,["Prime personnalisée","Numérique","Soumission"],["Personalized premium","Digital","Quote"],["online_quote","digital","usage"],"quote","https://www.belairdirect.com/","belairdirect",null,null,null,null,null,null,null,null,null,"2026-09-24"],["auto_insurance","Sonnet","sonnet","Sonnet Auto Insurance","Assurance automobile numérique","Digital auto insurance","Parcours de soumission et d’achat en ligne dans les provinces desservies.","Online quote and purchase journey in served provinces.",null,null,["Prime personnalisée","100 % en ligne","Selon province"],["Personalized premium","Online-first","By province"],["online_quote","digital"],"quote","https://www.sonnet.ca/auto-insurance","Sonnet",null,null,null,null,null,null,null,null,null,"2026-09-24"],["life_insurance","Canada Life","canadalife","Canada Life My Term","Assurance vie temporaire","Term life insurance","Durées personnalisables et options de conversion selon le produit.","Customizable term lengths with conversion options.",null,null,["Prime personnalisée","Terme flexible","Conversion possible"],["Personalized premium","Flexible term","Conversion available"],["term","flexible_term","convertible","online_quote"],"quote","https://www.canadalife.com/insurance/life-insurance/term-life-insurance/myterm.html","Canada Life",null,null,null,null,null,null,null,null,null,"2026-09-24"],["life_insurance","Sun Life","sunlife","Sun Life Term Life Insurance","Assurance vie temporaire","Term life insurance","Protection temporaire pour revenu, dettes et besoins familiaux.","Temporary protection for income, debts and family needs.",null,null,["Prime personnalisée","Temporaire","Conseiller / soumission"],["Personalized premium","Term coverage","Advisor / quote"],["term","convertible","advisor"],"quote","https://www.sunlife.ca/en/insurance/life/term-life-insurance/","Sun Life",null,null,null,null,null,null,null,null,null,"2026-09-24"],["life_insurance","Manulife","manulife","Manulife Life Insurance","Assurance vie","Life insurance","Solutions de protection vie selon âge, santé et montant assuré.","Life protection based on age, health and coverage amount.",null,null,["Prime personnalisée","Temporaire / autres options","Protection sur mesure"],["Personalized premium","Term / other options","Custom coverage"],["term","online_quote","convertible"],"quote","https://www.manulife.ca/personal/insurance/our-products/life-insurance.html","Manulife",null,null,null,null,null,null,null,null,null,"2026-09-24"],["life_insurance","RBC Insurance","rbc","RBC Term Life Insurance","Assurance vie temporaire","Term life insurance","Protection temporaire avec soumission selon âge, santé et montant assuré.","Term protection quoted by age, health and coverage amount.",null,null,["Prime personnalisée","Temporaire","RBC Assurance"],["Personalized premium","Term coverage","RBC Insurance"],["term","online_quote","convertible"],"quote","https://www.rbcinsurance.com/life-insurance/index.html","RBC Insurance",null,null,null,null,null,null,null,null,null,"2026-09-24"],["life_insurance","Desjardins Insurance","desjardins","Desjardins Life Insurance","Assurance vie","Life insurance","Solutions temporaires et permanentes selon le besoin de protection.","Term and permanent solutions depending on protection needs.",null,null,["Prime personnalisée","Temporaire + permanente","Conseiller"],["Personalized premium","Term + permanent","Advisor"],["term","permanent","advisor","convertible"],"quote","https://www.desjardins.com/ca/personal/insurance/life-health/life-insurance/","Desjardins",null,null,null,null,null,null,null,null,null,"2026-09-24"],["life_insurance","Beneva","beneva","Beneva Life Insurance","Assurance vie","Life insurance","Protection vie temporaire et permanente selon les besoins.","Term and permanent life coverage based on needs.",null,null,["Prime personnalisée","Temporaire + permanente","Québec / Canada"],["Personalized premium","Term + permanent","Quebec / Canada"],["term","permanent","advisor"],"quote","https://www.beneva.ca/en/life-insurance","Beneva",null,null,null,null,null,null,null,null,null,"2026-09-24"],["life_insurance","iA Financial Group","ia","iA Life Insurance","Assurance vie","Life insurance","Gamme de protections temporaires et permanentes.","Range of term and permanent life-insurance solutions.",null,null,["Prime personnalisée","Temporaire + permanente","Conseiller"],["Personalized premium","Term + permanent","Advisor"],["term","permanent","advisor","convertible"],"quote","https://ia.ca/individuals/insurance/life-insurance","iA",null,null,null,null,null,null,null,null,null,"2026-09-24"],["tax","Wealthsimple","wealthsimple","Wealthsimple Tax","Logiciel d’impôt","Tax software","Solution NETFILE en ligne avec option gratuite et services payants facultatifs.","Online NETFILE software with free filing and optional paid services.",null,null,["Option gratuite","En ligne","Homologué ARC"],["Free option","Online","CRA certified"],["free","online","guided","investing"],"registry","https://www.canada.ca/en/services/taxes/income-tax/personal-income-tax/how-file/tax-software/find-software.html","CRA",null,null,null,null,null,null,null,null,null,"2026-09-24"],["tax","CloudTax","cloudtax","CloudTax","Logiciel d’impôt","Tax software","Solution homologuée avec offre gratuite et accès web/mobile selon l’année.","Certified software with free offerings and web/mobile access depending on tax year.",null,null,["Option gratuite","Web + mobile","T1135 selon version"],["Free option","Web + mobile","T1135 by version"],["free","online","mobile","t1135"],"registry","https://www.canada.ca/en/services/taxes/income-tax/personal-income-tax/how-file/tax-software/find-software.html","CRA",null,null,null,null,null,null,null,null,null,"2026-09-24"],["tax","Intuit","turbotax","TurboTax","Logiciel d’impôt","Tax software","Options gratuites ou payantes selon la complexité et le niveau d’accompagnement.","Free and paid options depending on complexity and desired guidance.",null,null,["Gratuit / payant","Web + mobile + bureau","Accompagnement"],["Free / paid","Web + mobile + desktop","Guidance"],["online","mobile","download","guided","self_employed","investing","t1135"],"registry","https://www.canada.ca/en/services/taxes/income-tax/personal-income-tax/how-file/tax-software/find-software.html","CRA",null,null,null,null,null,null,null,null,null,"2026-09-24"],["tax","H&R Block","hrblock","H&R Block Tax Software","Logiciel d’impôt","Tax software","Production en ligne avec niveaux d’accompagnement et services professionnels.","Online filing with guided tiers and professional-help options.",null,null,["Gratuit / payant","En ligne","Aide disponible"],["Free / paid","Online","Help available"],["online","guided","pro_help","self_employed","investing"],"registry","https://www.canada.ca/en/services/taxes/income-tax/personal-income-tax/how-file/tax-software/find-software.html","CRA",null,null,null,null,null,null,null,null,null,"2026-09-24"],["tax","UFile","ufile","UFile","Logiciel d’impôt","Tax software","Logiciel homologué offert en ligne et selon les versions en téléchargement.","Certified software offered online and, by version, as a download.",null,null,["Payant / admissibilité gratuite","Web + bureau","Homologué ARC"],["Paid / free eligibility","Web + desktop","CRA certified"],["online","download","investing","self_employed"],"registry","https://www.canada.ca/en/services/taxes/income-tax/personal-income-tax/how-file/tax-software/find-software.html","CRA",null,null,null,null,null,null,null,null,null,"2026-09-24"],["tax","StudioTax","studiotax","StudioTax","Logiciel d’impôt","Tax software","Solution homologuée avec versions de bureau et mobile selon l’année.","Certified filing software with desktop and mobile versions depending on tax year.",null,null,["Prix à vérifier","Bureau + mobile","Homologué ARC"],["Verify price","Desktop + mobile","CRA certified"],["download","mobile","investing"],"registry","https://www.canada.ca/en/services/taxes/income-tax/personal-income-tax/how-file/tax-software/find-software.html","CRA",null,null,null,null,null,null,null,null,null,"2026-09-24"],["tax","GenuSource Consulting","genutax","GenuTax Standard","Logiciel d’impôt","Tax software","Logiciel gratuit homologué; l’ARC indique qu’il ne produit pas la déclaration TP-1 du Québec.","Free certified software; CRA indicates it does not prepare Quebec’s TP-1 return.",null,null,["Gratuit","Téléchargement","Pas TP-1 Québec"],["Free","Download","No Quebec TP-1"],["free","download","no_qc"],"registry","https://www.canada.ca/en/services/taxes/income-tax/personal-income-tax/how-file/tax-software/find-software/genutax-details.html","CRA",null,null,null,null,null,null,null,null,null,"2026-09-24"]];
  return rows.map((row) => Object.fromEntries(CATALOG_FIELDS.map((key, index) => [key, row[index]])) as ShoppingProduct);
})();

function str(answers: ShoppingAnswers, key: string): string {
  const value = answers[key];
  return typeof value === "string" ? value : "";
}

function num(answers: ShoppingAnswers, key: string): number {
  const value = answers[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function has(product: ShoppingProduct, tag: string): boolean {
  return product.tags.includes(tag);
}

function clamp(value: number): number {
  return Math.max(20, Math.min(98, Math.round(value)));
}

function incomeUpperBand(value: string): number | null {
  if (value === "under60") return 59999;
  if (value === "60_100") return 99999;
  if (value === "100_150") return 149999;
  if (value === "150plus") return Number.POSITIVE_INFINITY;
  return null;
}

function scoreCreditCard(product: ShoppingProduct, answers: ShoppingAnswers, reasonsFr: string[], reasonsEn: string[], cautionsFr: string[], cautionsEn: string[]): number {
  let score = 48;
  const behavior = str(answers, "balance_behavior");
  const reward = str(answers, "reward_goal");
  const spendFocus = str(answers, "spend_focus");
  const feeComfort = str(answers, "fee_comfort");
  const travel = str(answers, "travel_frequency");
  const income = str(answers, "income_band");
  const ecosystem = str(answers, "ecosystem");
  const carried = num(answers, "carried_balance");

  if (behavior === "carry" || behavior === "sometimes") {
    if (product.purchaseRate != null) {
      score += Math.max(-14, Math.min(34, (22 - product.purchaseRate) * (behavior === "carry" ? 4 : 2.4)));
      if (product.purchaseRate <= 14) {
        reasonsFr.push(`Taux d’achat publié de ${product.purchaseRate.toLocaleString("fr-CA")} %, pertinent si tu reportes un solde.`);
        reasonsEn.push(`Published purchase rate of ${product.purchaseRate.toLocaleString("en-CA")}%, relevant if you carry a balance.`);
      }
    } else {
      score -= 7;
      cautionsFr.push("Le taux d’achat doit être vérifié à la source.");
      cautionsEn.push("The purchase rate must be verified at source.");
    }
    if (has(product, "low_rate")) score += behavior === "carry" ? 22 : 12;
    if (carried >= 1000 && has(product, "low_rate")) score += 7;
  } else if (behavior === "full" && !has(product, "low_rate")) {
    score += 5;
  }

  const rewardTag = reward === "cashback" ? "cashback" : reward === "travel" ? "travel" : reward === "insurance" ? "insurance" : reward === "low_fee" ? "no_fee" : "";
  if (rewardTag && has(product, rewardTag)) {
    score += 20;
    reasonsFr.push("La structure de la carte correspond à l’avantage que tu recherches.");
    reasonsEn.push("The card structure matches the benefit you are looking for.");
  }

  if (feeComfort === "none") {
    if (product.annualFee === 0) {
      score += 20;
      reasonsFr.push("Ta préférence de frais annuels à 0 $ est respectée.");
      reasonsEn.push("It matches your $0 annual-fee preference.");
    } else if (product.annualFee != null) {
      score -= Math.min(32, product.annualFee / 5);
    }
  }
  if (feeComfort === "moderate" && product.annualFee != null && product.annualFee <= 120) score += 8;

  if (spendFocus && has(product, spendFocus)) {
    score += 13;
    reasonsFr.push("Ses catégories fortes recoupent ton principal poste de dépenses.");
    reasonsEn.push("Its stronger categories overlap your main spending area.");
  }
  if (travel === "frequent") {
    if (has(product, "travel")) score += 12;
    if (has(product, "no_fx")) score += 9;
    if (has(product, "insurance")) score += 6;
  } else if (travel === "none" && has(product, "travel") && (product.annualFee ?? 0) > 100) {
    score -= 10;
  }
  if (ecosystem && ecosystem !== "none" && has(product, ecosystem)) {
    score += 20;
    reasonsFr.push("Tu utilises déjà un écosystème qui peut augmenter la valeur de cette carte.");
    reasonsEn.push("You already use an ecosystem that can increase this card’s value.");
  }

  const upper = incomeUpperBand(income);
  const threshold = product.incomePersonal;
  if (threshold != null && upper != null) {
    if (threshold <= upper) score += 4;
    else {
      score -= 12;
      cautionsFr.push("Le seuil de revenu personnel publié semble supérieur à ta fourchette; l’admissibilité doit être confirmée.");
      cautionsEn.push("The published personal-income threshold appears above your range; eligibility must be confirmed.");
    }
  } else if (threshold != null && !upper) {
    cautionsFr.push("Admissibilité à confirmer selon le revenu et l’approbation de crédit.");
    cautionsEn.push("Eligibility must be confirmed based on income and credit approval.");
  }
  return score;
}

function scoreBanking(product: ShoppingProduct, answers: ShoppingAnswers, reasonsFr: string[], reasonsEn: string[]): number {
  let score = 50;
  const goal = str(answers, "banking_goal");
  const branch = str(answers, "branch_need");
  const fee = str(answers, "fee_tolerance");
  const status = str(answers, "special_status");
  const transactions = num(answers, "monthly_transactions");
  const balance = num(answers, "average_balance");
  if (fee === "zero" && product.monthlyFee === 0) {
    score += 27;
    reasonsFr.push("Aucuns frais mensuels publiés.");
    reasonsEn.push("No published monthly fee.");
  }
  if (fee === "low" && product.monthlyFee != null && product.monthlyFee <= 5) score += 18;
  if (product.minimumBalance != null && product.minimumBalance > 0 && balance >= product.minimumBalance) {
    score += 15;
    reasonsFr.push("Ton solde déclaré atteint le seuil publié pour l’exonération de frais.");
    reasonsEn.push("Your stated balance reaches the published fee-waiver threshold.");
  }
  if (transactions >= 20 && has(product, "unlimited")) score += 16;
  if (branch === "never" && has(product, "digital")) score += 14;
  if ((branch === "sometimes" || branch === "often") && has(product, "branch")) score += branch === "often" ? 18 : 10;
  if (status !== "none" && has(product, status)) score += 12;
  if (goal === "savings" && has(product, "savings")) score += 18;
  if (goal === "everyday" && has(product, "unlimited")) score += 7;
  return score;
}

function scoreMortgage(product: ShoppingProduct, answers: ShoppingAnswers, reasonsFr: string[], reasonsEn: string[]): number {
  let score = 54;
  const comfort = str(answers, "rate_comfort");
  const horizon = str(answers, "change_horizon");
  const buffer = str(answers, "payment_buffer");
  const stage = str(answers, "mortgage_stage");
  if (comfort === "certainty" && has(product, "fixed")) {
    score += 19;
    reasonsFr.push("Tu privilégies la prévisibilité; ce prêteur offre des options à taux fixe.");
    reasonsEn.push("You prioritize predictability; this lender offers fixed-rate options.");
  }
  if (comfort === "flexibility" && has(product, "variable")) {
    score += 18;
    reasonsFr.push("Tu acceptes davantage de variation; des options variables sont disponibles.");
    reasonsEn.push("You accept more variability; variable options are available.");
  }
  if (horizon === "under3" && (has(product, "open") || has(product, "prepayment"))) score += 14;
  if (horizon === "3to5" && has(product, "prepayment")) score += 9;
  if (buffer === "tight" && has(product, "fixed")) score += 11;
  if (stage === "refinance" && has(product, "refinance")) score += 9;
  return score;
}

function scoreStudent(product: ShoppingProduct, answers: ShoppingAnswers, reasonsFr: string[], reasonsEn: string[]): number {
  let score = 48;
  const stage = str(answers, "student_stage");
  const style = str(answers, "repayment_style");
  const cosigner = str(answers, "cosigner");
  if (has(product, stage)) score += 20;
  if (style === "flexible" && has(product, "flexible")) score += 20;
  if (style === "fixed" && has(product, "fixed")) score += 18;
  if (product.rateSpread != null) {
    score += Math.max(0, 12 - product.rateSpread * 5);
    reasonsFr.push("L’écart de taux publié est disponible pour comparaison.");
    reasonsEn.push("A published rate spread is available for comparison.");
  }
  if (cosigner === "no" && has(product, "professional")) {
    reasonsFr.push("Les exigences de cosignataire varient fortement selon le programme; vérification nécessaire.");
    reasonsEn.push("Co-signer requirements vary materially by program; verify eligibility.");
  }
  return score;
}

function scorePersonalLoan(product: ShoppingProduct, answers: ShoppingAnswers, reasonsFr: string[], reasonsEn: string[]): number {
  let score = 50;
  const style = str(answers, "repayment_style");
  const purpose = str(answers, "loan_purpose");
  const homeowner = str(answers, "homeowner");
  if (style === "fixed" && has(product, "fixed")) score += 22;
  if (style === "revolving" && has(product, "revolving")) score += 22;
  if (style === "lowest_cost" && has(product, "secured") && homeowner === "yes") score += 24;
  if (purpose === "consolidation" && has(product, "consolidation")) {
    score += 12;
    reasonsFr.push("Le produit peut être utilisé pour une consolidation, sous réserve d’approbation.");
    reasonsEn.push("The product may be used for consolidation, subject to approval.");
  }
  if (has(product, "installment")) {
    reasonsFr.push("Le remboursement amorti fournit une échéance et un paiement planifiés.");
    reasonsEn.push("Installment repayment provides a scheduled payment and payoff horizon.");
  }
  return score;
}

function scoreAuto(product: ShoppingProduct, answers: ShoppingAnswers, reasonsFr: string[], reasonsEn: string[]): number {
  let score = 50;
  const km = str(answers, "annual_km");
  const bundle = str(answers, "bundle");
  if (km === "under10" && has(product, "usage")) {
    score += 18;
    reasonsFr.push("Ton faible kilométrage rend une tarification liée à l’usage plus pertinente à comparer.");
    reasonsEn.push("Your lower mileage makes usage-based pricing more relevant to compare.");
  }
  if (bundle === "yes" && has(product, "bundle")) score += 17;
  if (has(product, "online_quote")) score += 7;
  return score;
}

function scoreLife(product: ShoppingProduct, answers: ShoppingAnswers, reasonsFr: string[], reasonsEn: string[]): number {
  let score = 50;
  const horizon = str(answers, "coverage_horizon");
  const need = str(answers, "main_need");
  const budget = str(answers, "budget_style");
  if ((horizon === "10" || horizon === "20_30") && has(product, "term")) score += 24;
  if (horizon === "lifetime" && has(product, "permanent")) score += 27;
  if ((need === "income" || need === "mortgage") && has(product, "term")) score += 10;
  if (need === "estate" && has(product, "permanent")) score += 14;
  if (budget === "lowest" && has(product, "term")) score += 12;
  if (budget === "permanent" && has(product, "permanent")) score += 12;
  if (has(product, "flexible_term")) {
    reasonsFr.push("La durée peut être ajustée plus finement au besoin déclaré.");
    reasonsEn.push("The term can be aligned more closely with your stated need.");
  }
  return score;
}

function scoreTax(product: ShoppingProduct, answers: ShoppingAnswers, reasonsFr: string[], reasonsEn: string[], cautionsFr: string[], cautionsEn: string[]): number {
  let score = 50;
  const complexity = str(answers, "tax_complexity");
  const foreign = str(answers, "foreign_assets");
  const help = str(answers, "help_level");
  const budget = str(answers, "tax_budget");
  const device = str(answers, "device");
  const province = str(answers, "province");
  if (budget === "free" && has(product, "free")) score += 25;
  if (help === "guided" && has(product, "guided")) score += 20;
  if (help === "pro" && has(product, "pro_help")) score += 24;
  if (complexity === "self_employed" && has(product, "self_employed")) score += 15;
  if (complexity === "investing" && has(product, "investing")) score += 13;
  if (foreign === "yes" && has(product, "t1135")) score += 16;
  if (device === "online" && has(product, "online")) score += 10;
  if (device === "mobile" && has(product, "mobile")) score += 10;
  if (device === "download" && has(product, "download")) score += 10;
  if (province === "QC" && has(product, "no_qc")) {
    score -= 50;
    cautionsFr.push("L’ARC indique que ce logiciel ne produit pas la déclaration TP-1 du Québec.");
    cautionsEn.push("CRA indicates that this software does not prepare Quebec’s TP-1 return.");
  }
  return score;
}

export function recommendShoppingProducts(category: ShoppingCategoryId, answers: ShoppingAnswers): ShoppingProductMatch[] {
  const province = str(answers, "province");
  return SHOPPING_PRODUCT_CATALOG
    .filter((product) => product.category === category)
    .filter((product) => !product.provinces || !province || product.provinces.includes(province))
    .map((product) => {
      const reasonsFr: string[] = [];
      const reasonsEn: string[] = [];
      const cautionsFr: string[] = [];
      const cautionsEn: string[] = [];
      let score = 50;
      if (category === "credit_card") score = scoreCreditCard(product, answers, reasonsFr, reasonsEn, cautionsFr, cautionsEn);
      else if (category === "banking") score = scoreBanking(product, answers, reasonsFr, reasonsEn);
      else if (category === "mortgage") score = scoreMortgage(product, answers, reasonsFr, reasonsEn);
      else if (category === "student_loan") score = scoreStudent(product, answers, reasonsFr, reasonsEn);
      else if (category === "personal_loan") score = scorePersonalLoan(product, answers, reasonsFr, reasonsEn);
      else if (category === "auto_insurance") score = scoreAuto(product, answers, reasonsFr, reasonsEn);
      else if (category === "life_insurance") score = scoreLife(product, answers, reasonsFr, reasonsEn);
      else if (category === "tax") score = scoreTax(product, answers, reasonsFr, reasonsEn, cautionsFr, cautionsEn);

      if (product.dataMode === "quote") {
        cautionsFr.push("Le prix/taux est personnalisé : Anatole compare l’adéquation du produit, pas une prime ou un taux non obtenu.");
        cautionsEn.push("Price/rate is personalized: Anatole compares product fit, not a premium or rate it has not obtained.");
      }
      if (product.dataMode === "live_rate") {
        cautionsFr.push("Le taux hypothécaire change : la page officielle doit être consultée au moment de la décision.");
        cautionsEn.push("Mortgage rates change: the official page must be checked when making a decision.");
      }
      if (product.dataMode === "partial") {
        cautionsFr.push("Certaines données restent N/D plutôt que d’être estimées.");
        cautionsEn.push("Some fields remain N/A rather than being estimated.");
      }
      if (!reasonsFr.length) {
        reasonsFr.push("Ce produit reste compatible avec les critères renseignés et mérite une comparaison à la source.");
        reasonsEn.push("This product remains compatible with the entered criteria and is worth comparing at source.");
      }
      return {
        product,
        matchScore: clamp(score),
        reasonsFr: [...new Set(reasonsFr)].slice(0, 3),
        reasonsEn: [...new Set(reasonsEn)].slice(0, 3),
        cautionsFr: [...new Set(cautionsFr)].slice(0, 2),
        cautionsEn: [...new Set(cautionsEn)].slice(0, 2),
      };
    })
    .sort((a, b) => b.matchScore - a.matchScore);
}

export function productCountFor(category: ShoppingCategoryId): number {
  return SHOPPING_PRODUCT_CATALOG.filter((product) => product.category === category).length;
}

export function issuerCountFor(category: ShoppingCategoryId): number {
  return new Set(SHOPPING_PRODUCT_CATALOG.filter((product) => product.category === category).map((product) => product.issuer)).size;
}
