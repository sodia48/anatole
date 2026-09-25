"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Car,
  Check,
  ChevronLeft,
  CreditCard,
  ExternalLink,
  FileText,
  GraduationCap,
  House,
  Landmark,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Target,
  WalletCards,
} from "lucide-react";
import {
  useMemo,
  useState,
} from "react";

import { usePreferences } from "@/components/providers/PreferencesProvider";
import { localeFor, pick } from "@/lib/i18n";
import {
  SHOPPING_CATEGORIES,
  STARTER_OFFERS,
  evaluateShoppingOffers,
  offersForCategory,
  type ShoppingCategoryId,
} from "@/lib/shopping";
import {
  questionAnswered,
  shoppingProfileFromAnswers,
  shoppingQuestionsFor,
  shoppingSourceById,
  shoppingSuggestionsFor,
  type ShoppingAnswer,
  type ShoppingAnswers,
  type ShoppingQuestion,
} from "@/lib/shoppingWizard";

import styles from "./Shopping.module.css";

const ICONS = {
  credit_card: CreditCard,
  banking: Landmark,
  mortgage: House,
  student_loan: GraduationCap,
  personal_loan: Banknote,
  auto_insurance: Car,
  life_insurance: ShieldCheck,
  tax: ReceiptText,
} satisfies Record<ShoppingCategoryId, typeof CreditCard>;

type Stage = "category" | "quiz" | "results";

function money(
  value: number | null | undefined,
  language: "fr" | "en",
): string {
  if (value == null || !Number.isFinite(value)) return "N/D";
  return new Intl.NumberFormat(localeFor(language), {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(value);
}

function answerLabel(
  question: ShoppingQuestion,
  answer: ShoppingAnswer | undefined,
  language: "fr" | "en",
): string {
  if (answer == null) return "";
  if (question.type === "number") {
    return `${Number(answer).toLocaleString(localeFor(language))}${
      language === "fr"
        ? question.suffixFr
          ? ` ${question.suffixFr}`
          : ""
        : question.suffixEn
          ? ` ${question.suffixEn}`
          : ""
    }`;
  }
  const option = question.options?.find(
    (item) => item.value === String(answer),
  );
  return option
    ? pick(language, option.labelFr, option.labelEn)
    : String(answer);
}

function QuestionView({
  question,
  answer,
  language,
  onAnswer,
}: {
  question: ShoppingQuestion;
  answer: ShoppingAnswer | undefined;
  language: "fr" | "en";
  onAnswer: (value: ShoppingAnswer) => void;
}) {
  if (question.type === "number") {
    return (
      <div className={styles.numberAnswer}>
        <input
          autoFocus
          min={question.min}
          max={question.max}
          step={question.step ?? 1}
          type="number"
          value={typeof answer === "number" ? String(answer) : ""}
          onChange={(event) => {
            const raw = event.target.value;
            const parsed = Number(raw);
            if (!raw || !Number.isFinite(parsed)) return;
            onAnswer(parsed);
          }}
          placeholder="0"
        />
        <span>
          {pick(
            language,
            question.suffixFr ?? "",
            question.suffixEn ?? "",
          )}
        </span>
      </div>
    );
  }

  if (question.type === "select") {
    return (
      <select
        autoFocus
        className={styles.selectAnswer}
        value={typeof answer === "string" ? answer : ""}
        onChange={(event) => onAnswer(event.target.value)}
      >
        <option value="">
          {pick(language, "Choisir…", "Choose…")}
        </option>
        {question.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {pick(language, option.labelFr, option.labelEn)}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className={styles.answerGrid}>
      {question.options?.map((option) => {
        const active = answer === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className={`${styles.answerCard} ${
              active ? styles.answerCardActive : ""
            }`}
            onClick={() => onAnswer(option.value)}
          >
            <span className={styles.answerCheck}>
              {active ? <Check size={14} /> : null}
            </span>
            <strong>
              {pick(language, option.labelFr, option.labelEn)}
            </strong>
            {option.detailFr || option.detailEn ? (
              <small>
                {pick(
                  language,
                  option.detailFr ?? "",
                  option.detailEn ?? "",
                )}
              </small>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function ShoppingClient() {
  const { preferences } = usePreferences();
  const language = preferences.language;

  const [stage, setStage] = useState<Stage>("category");
  const [category, setCategory] =
    useState<ShoppingCategoryId | null>(null);
  const [answers, setAnswers] = useState<ShoppingAnswers>({});
  const [questionIndex, setQuestionIndex] = useState(0);

  const questions = useMemo(
    () =>
      category
        ? shoppingQuestionsFor(category, answers)
        : [],
    [answers, category],
  );

  const currentQuestion =
    questions[Math.min(questionIndex, Math.max(0, questions.length - 1))] ??
    null;

  const profile = useMemo(
    () =>
      category
        ? shoppingProfileFromAnswers(category, answers)
        : null,
    [answers, category],
  );

  const suggestions = useMemo(
    () =>
      category
        ? shoppingSuggestionsFor(category, answers)
        : [],
    [answers, category],
  );

  const verifiedOffers = useMemo(() => {
    if (!category || !profile) return [];
    return evaluateShoppingOffers(
      offersForCategory(category, STARTER_OFFERS),
      profile,
      null,
    ).slice(0, 4);
  }, [category, profile]);

  const categoryMeta = category
    ? SHOPPING_CATEGORIES.find((item) => item.id === category) ?? null
    : null;

  const completedCount = questions.filter((question) =>
    questionAnswered(question, answers),
  ).length;

  const progress =
    questions.length > 0
      ? Math.round((completedCount / questions.length) * 100)
      : 0;

  function chooseCategory(next: ShoppingCategoryId) {
    setCategory(next);
    setAnswers({});
    setQuestionIndex(0);
    setStage("quiz");
  }

  function answer(value: ShoppingAnswer) {
    if (!currentQuestion) return;
    setAnswers((current) => ({
      ...current,
      [currentQuestion.id]: value,
    }));
  }

  function next() {
    if (!currentQuestion || !questionAnswered(currentQuestion, answers)) {
      return;
    }
    if (questionIndex >= questions.length - 1) {
      setStage("results");
      return;
    }
    setQuestionIndex((current) => current + 1);
  }

  function previous() {
    if (questionIndex === 0) {
      setStage("category");
      return;
    }
    setQuestionIndex((current) => Math.max(0, current - 1));
  }

  function restartQuiz() {
    setAnswers({});
    setQuestionIndex(0);
    setStage("quiz");
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <Link href="/assistant" className={styles.backLink}>
            <ArrowLeft size={15} />
            {pick(language, "Anatole Conseil", "Anatole Advice")}
          </Link>
          <span className={styles.eyebrow}>
            ANATOLE {pick(language, "MAGASINER", "SHOP")}
          </span>
          <h1>
            {pick(
              language,
              "Dis-moi ce dont tu as besoin. Anatole fait le tri.",
              "Tell me what you need. Anatole sorts it out.",
            )}
          </h1>
          <p>
            {pick(
              language,
              "Tu ne remplis plus un tableau d’offres. Anatole te pose quelques questions, construit ton profil de magasinage et te présente les pistes qui correspondent le mieux à tes réponses.",
              "You no longer fill out an offer spreadsheet. Anatole asks a few questions, builds your shopping profile and shows the paths that best fit your answers.",
            )}
          </p>
        </div>
        <div className={styles.heroSeal}>
          <Sparkles size={22} />
          <strong>
            {stage === "results"
              ? `${suggestions[0]?.matchScore ?? "—"}%`
              : "Q&A"}
          </strong>
          <span>
            {stage === "results"
              ? pick(language, "meilleure correspondance", "top match")
              : pick(language, "questions adaptatives", "adaptive questions")}
          </span>
        </div>
      </header>

      <section className={styles.promiseBar}>
        <span>
          <ShieldCheck size={15} />
          {pick(
            language,
            "Aucun produit ne paie pour remonter dans les résultats.",
            "No product pays to rank higher.",
          )}
        </span>
        <span>
          <Target size={15} />
          {pick(
            language,
            "Les propositions reflètent uniquement les réponses et les données disponibles.",
            "Suggestions reflect only your answers and available data.",
          )}
        </span>
      </section>

      {stage === "category" ? (
        <section className={styles.categoryStage}>
          <div className={styles.stageHeading}>
            <span>01</span>
            <div>
              <h2>
                {pick(
                  language,
                  "Qu’est-ce que tu veux magasiner ?",
                  "What are you shopping for?",
                )}
              </h2>
              <p>
                {pick(
                  language,
                  "Choisis une catégorie. Le questionnaire change complètement selon le produit.",
                  "Choose a category. The questionnaire changes completely by product.",
                )}
              </p>
            </div>
          </div>

          <div className={styles.categoryGrid}>
            {SHOPPING_CATEGORIES.map((item) => {
              const Icon = ICONS[item.id];
              return (
                <button
                  key={item.id}
                  type="button"
                  className={styles.categoryCard}
                  onClick={() => chooseCategory(item.id)}
                >
                  <span className={styles.categoryIcon}>
                    <Icon size={24} />
                  </span>
                  <strong>
                    {pick(language, item.labelFr, item.labelEn)}
                  </strong>
                  <small>
                    {pick(
                      language,
                      item.descriptionFr,
                      item.descriptionEn,
                    )}
                  </small>
                  <span className={styles.categoryCta}>
                    {pick(language, "Commencer", "Start")}{" "}
                    <ArrowRight size={13} />
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {stage === "quiz" && category && currentQuestion ? (
        <section className={styles.quizShell}>
          <aside className={styles.quizRail}>
            <button
              type="button"
              className={styles.categoryMini}
              onClick={() => setStage("category")}
            >
              {(() => {
                const Icon = ICONS[category];
                return <Icon size={18} />;
              })()}
              <span>
                {pick(
                  language,
                  categoryMeta?.labelFr ?? "",
                  categoryMeta?.labelEn ?? "",
                )}
              </span>
            </button>

            <div className={styles.progressBlock}>
              <div>
                <span>
                  {pick(language, "Progression", "Progress")}
                </span>
                <strong>{progress}%</strong>
              </div>
              <div className={styles.progressTrack}>
                <span style={{ width: `${progress}%` }} />
              </div>
              <small>
                {pick(
                  language,
                  `Question ${questionIndex + 1} sur ${questions.length}`,
                  `Question ${questionIndex + 1} of ${questions.length}`,
                )}
              </small>
            </div>

            <div className={styles.railNote}>
              <WalletCards size={18} />
              <p>
                {pick(
                  language,
                  "Une seule question à la fois. Les questions inutiles sont retirées automatiquement.",
                  "One question at a time. Irrelevant questions are removed automatically.",
                )}
              </p>
            </div>
          </aside>

          <div className={styles.questionPanel}>
            <div className={styles.questionNumber}>
              {String(questionIndex + 1).padStart(2, "0")}
            </div>
            <div className={styles.questionCopy}>
              <span className={styles.eyebrow}>
                {pick(
                  language,
                  "TON PROFIL DE MAGASINAGE",
                  "YOUR SHOPPING PROFILE",
                )}
              </span>
              <h2>
                {pick(
                  language,
                  currentQuestion.promptFr,
                  currentQuestion.promptEn,
                )}
              </h2>
              <p>
                {pick(
                  language,
                  currentQuestion.helperFr,
                  currentQuestion.helperEn,
                )}
              </p>
            </div>

            <QuestionView
              question={currentQuestion}
              answer={answers[currentQuestion.id]}
              language={language}
              onAnswer={answer}
            />

            <div className={styles.quizActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={previous}
              >
                <ChevronLeft size={15} />
                {pick(language, "Retour", "Back")}
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                disabled={!questionAnswered(currentQuestion, answers)}
                onClick={next}
              >
                {questionIndex >= questions.length - 1
                  ? pick(
                      language,
                      "Voir mes propositions",
                      "See my suggestions",
                    )
                  : pick(language, "Continuer", "Continue")}
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {stage === "results" && category && profile ? (
        <section className={styles.resultsStage}>
          <div className={styles.resultsHero}>
            <div>
              <span className={styles.eyebrow}>
                {pick(
                  language,
                  "PROFIL TERMINÉ",
                  "PROFILE COMPLETE",
                )}
              </span>
              <h2>
                {pick(
                  language,
                  "Voici ce qu’Anatole te propose.",
                  "Here is what Anatole suggests.",
                )}
              </h2>
              <p>
                {pick(
                  language,
                  "Ce ne sont pas des gagnants absolus. Ce sont les structures qui correspondent le mieux à tes réponses, avec les points à vérifier avant de choisir un fournisseur.",
                  "These are not absolute winners. They are the structures that best fit your answers, with the items to verify before choosing a provider.",
                )}
              </p>
            </div>
            <div className={styles.resultsActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => {
                  setStage("quiz");
                  setQuestionIndex(0);
                }}
              >
                <ArrowLeft size={14} />
                {pick(language, "Modifier mes réponses", "Edit my answers")}
              </button>
              <button
                type="button"
                className={styles.ghostButton}
                onClick={restartQuiz}
              >
                <RotateCcw size={14} />
                {pick(language, "Recommencer", "Restart")}
              </button>
            </div>
          </div>

          <div className={styles.answerSummary}>
            {questions.map((question) => {
              const label = answerLabel(
                question,
                answers[question.id],
                language,
              );
              if (!label) return null;
              return (
                <span key={question.id}>
                  <small>
                    {pick(
                      language,
                      question.promptFr,
                      question.promptEn,
                    )}
                  </small>
                  <strong>{label}</strong>
                </span>
              );
            })}
          </div>

          <div className={styles.suggestionGrid}>
            {suggestions.slice(0, 3).map((suggestion, index) => {
              const source = suggestion.sourceIds
                .map(shoppingSourceById)
                .find(Boolean);
              return (
                <article
                  key={suggestion.id}
                  className={`${styles.suggestionCard} ${
                    index === 0 ? styles.suggestionPrimary : ""
                  }`}
                >
                  <header>
                    <span className={styles.rankTag}>
                      {index === 0
                        ? pick(language, "MEILLEURE CORRESPONDANCE", "TOP MATCH")
                        : `#${index + 1}`}
                    </span>
                    <div className={styles.matchScore}>
                      <strong>{suggestion.matchScore}%</strong>
                      <span>
                        {pick(language, "match", "match")}
                      </span>
                    </div>
                  </header>

                  <h3>
                    {pick(
                      language,
                      suggestion.titleFr,
                      suggestion.titleEn,
                    )}
                  </h3>
                  <p className={styles.suggestionDescription}>
                    {pick(
                      language,
                      suggestion.descriptionFr,
                      suggestion.descriptionEn,
                    )}
                  </p>

                  <div className={styles.reasonBlock}>
                    <strong>
                      {pick(
                        language,
                        "Pourquoi ça ressort",
                        "Why it stands out",
                      )}
                    </strong>
                    <ul>
                      {(language === "fr"
                        ? suggestion.whyFr
                        : suggestion.whyEn
                      ).map((item) => (
                        <li key={item}>
                          <Check size={13} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className={styles.watchBlock}>
                    <strong>
                      {pick(
                        language,
                        "À vérifier avant de signer",
                        "Verify before signing",
                      )}
                    </strong>
                    <ul>
                      {(language === "fr"
                        ? suggestion.watchFr
                        : suggestion.watchEn
                      ).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  {source ? (
                    <a
                      href={
                        language === "fr"
                          ? source.urlFr
                          : source.urlEn
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.sourceButton}
                    >
                      <FileText size={14} />
                      {pick(
                        language,
                        "Voir les offres / règles à la source",
                        "View offers / rules at source",
                      )}
                      <ExternalLink size={13} />
                    </a>
                  ) : null}
                </article>
              );
            })}
          </div>

          {verifiedOffers.length ? (
            <section className={styles.verifiedSection}>
              <div className={styles.stageHeading}>
                <span>+</span>
                <div>
                  <h2>
                    {pick(
                      language,
                      "Offres vérifiées déjà dans Anatole",
                      "Verified offers already in Anatole",
                    )}
                  </h2>
                  <p>
                    {pick(
                      language,
                      "Quand Anatole possède des données produit suffisamment structurées, il peut aussi afficher directement les offres qui correspondent à ton profil.",
                      "When Anatole has sufficiently structured product data, it can also show offers that fit your profile directly.",
                    )}
                  </p>
                </div>
              </div>

              <div className={styles.verifiedGrid}>
                {verifiedOffers.map((evaluation) => (
                  <article key={evaluation.offer.id}>
                    <div>
                      <span>{evaluation.offer.provider}</span>
                      <h3>{evaluation.offer.name}</h3>
                    </div>
                    <strong>{evaluation.matchScore}%</strong>
                    <p>
                      {pick(
                        language,
                        evaluation.metricLabelFr,
                        evaluation.metricLabelEn,
                      )}
                      :{" "}
                      <b>
                        {money(
                          evaluation.estimatedCost,
                          language,
                        )}
                      </b>
                    </p>
                    <a
                      href={evaluation.offer.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {pick(
                        language,
                        "Vérifier la fiche source",
                        "Verify source record",
                      )}
                      <ExternalLink size={12} />
                    </a>
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <section className={styles.dataBoundary}>
              <ShieldCheck size={19} />
              <div>
                <strong>
                  {pick(
                    language,
                    "Anatole ne fabrique pas d’offres qui ne sont pas dans ses données.",
                    "Anatole does not invent offers that are not in its data.",
                  )}
                </strong>
                <p>
                  {pick(
                    language,
                    "Pour cette catégorie, Anatole te donne d’abord le type de produit qui correspond à ton profil et t’envoie vers la source officielle. À mesure que les flux produits seront branchés, les offres réelles apparaîtront directement ici.",
                    "For this category, Anatole first shows the product structure that fits your profile and links to the official source. As product feeds are connected, live offers will appear directly here.",
                  )}
                </p>
              </div>
            </section>
          )}
        </section>
      ) : null}
    </main>
  );
}
