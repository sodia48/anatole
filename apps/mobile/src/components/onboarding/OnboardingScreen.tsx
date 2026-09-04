import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { Button, Card, Field, Screen, ScreenHeader } from "@/src/components/ui";
import { intelligenceApi } from "@/src/lib/api/intelligence";
import { useLocale } from "@/src/lib/i18n";
import { useMobileAccount } from "@/src/providers/MobileAccountProvider";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";
import { completeOnboarding, type OnboardingDraft, skipOnboarding } from "./model";

const SECTORS = ["Financials", "Energy", "Industrials", "Technology", "Materials", "Utilities", "Consumer", "Real Estate"];
const REGIONS = ["CA", "QC", "ON", "BC", "AB", "prairies", "atlantic"];

function Choice({ label, selected, onPress, testID }: { label: string; selected: boolean; onPress: () => void; testID?: string }) {
  return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: selected }} onPress={onPress} style={[styles.choice, selected && styles.choiceActive]} testID={testID}><Text style={[styles.choiceText, selected && styles.choiceTextActive]}>{label}</Text></Pressable>;
}

function toggle(values: string[], value: string, max = 20): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : values.length < max ? [...values, value] : values;
}

export function OnboardingScreen() {
  const { language, setLanguage, pick } = useLocale();
  const { workspace, saveWorkspace } = useMobileAccount();
  const [step, setStep] = useState(0);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<OnboardingDraft>({
    language,
    universe: "composite",
    symbols: [],
    sectors: [],
    regions: [],
    alertTemplates: [],
  });
  const results = useQuery({ queryKey: ["onboarding-search", search], queryFn: ({ signal }) => intelligenceApi.search(search, signal), enabled: step === 2 && search.trim().length >= 2, staleTime: 30 * 60_000 });
  const canContinue = step !== 2 || draft.symbols.length >= 3;
  const progress = `${step + 1}/7`;

  const finish = async (skip = false) => {
    await saveWorkspace(skip ? skipOnboarding(workspace.data) : completeOnboarding(workspace.data, draft));
    router.replace("/(tabs)/today");
  };
  const updateLanguage = (next: "fr" | "en") => { setLanguage(next); setDraft((current) => ({ ...current, language: next })); };
  const summary = useMemo(() => [
    draft.language.toUpperCase(), draft.universe === "composite" ? "TSX Composite" : "TSX 60",
    `${draft.symbols.length} ${pick("titres", "securities")}`,
    `${draft.sectors.length} ${pick("secteurs", "sectors")}`,
    `${draft.regions.length} ${pick("régions", "regions")}`,
    `${draft.alertTemplates.length} ${pick("types d’alertes", "alert types")}`,
  ], [draft, pick]);

  return <Screen testID="onboarding-screen">
    <View style={styles.top}><Text style={styles.progress}>{progress}</Text><Pressable accessibilityRole="button" onPress={() => void finish(true)} style={styles.skip} testID="onboarding-skip"><Text style={styles.skipText}>{pick("Passer", "Skip")}</Text></Pressable></View>
    <ScreenHeader eyebrow="ANATOLE MOBILE" title={[
      pick("Votre langue", "Your language"), pick("Votre univers", "Your universe"), pick("Vos titres", "Your securities"),
      pick("Secteurs d’intérêt", "Sectors of interest"), pick("Régions économiques", "Economic regions"), pick("Alertes optionnelles", "Optional alerts"), pick("Votre Anatole est prêt", "Your Anatole is ready"),
    ][step]!} subtitle={step === 2 ? pick("Choisissez 3 à 5 titres. La recherche reste légère.", "Choose 3 to 5 securities. Search remains lightweight.") : undefined} />

    {step === 0 ? <Card><View style={styles.wrap}><Choice label="Français" onPress={() => updateLanguage("fr")} selected={draft.language === "fr"} /><Choice label="English" onPress={() => updateLanguage("en")} selected={draft.language === "en"} /></View></Card> : null}
    {step === 1 ? <Card><Choice label="TSX Composite · recommandé" onPress={() => setDraft((current) => ({ ...current, universe: "composite" }))} selected={draft.universe === "composite"} /><Choice label="TSX 60" onPress={() => setDraft((current) => ({ ...current, universe: "tsx60" }))} selected={draft.universe === "tsx60"} /></Card> : null}
    {step === 2 ? <Card><Field autoCapitalize="characters" label={pick("Rechercher", "Search")} onChangeText={setSearch} placeholder="RY · Royal Bank" value={search} /><Text style={styles.hint}>{draft.symbols.length}/5</Text><View style={styles.wrap}>{draft.symbols.map((symbol) => <Choice key={symbol} label={symbol} onPress={() => setDraft((current) => ({ ...current, symbols: toggle(current.symbols, symbol, 5) }))} selected />)}{results.data?.items.filter((item) => !draft.symbols.includes(item.symbol)).slice(0, 8).map((item) => <Choice key={item.symbol} label={`${item.symbol} · ${item.name}`} onPress={() => setDraft((current) => ({ ...current, symbols: toggle(current.symbols, item.symbol, 5) }))} selected={false} />)}</View></Card> : null}
    {step === 3 ? <Card><View style={styles.wrap}>{SECTORS.map((sector) => <Choice key={sector} label={sector} onPress={() => setDraft((current) => ({ ...current, sectors: toggle(current.sectors, sector) }))} selected={draft.sectors.includes(sector)} />)}</View></Card> : null}
    {step === 4 ? <Card><View style={styles.wrap}>{REGIONS.map((region) => <Choice key={region} label={region === "CA" ? "Canada" : region === "atlantic" ? pick("Atlantique", "Atlantic") : region === "prairies" ? "Prairies" : region} onPress={() => setDraft((current) => ({ ...current, regions: toggle(current.regions, region) }))} selected={draft.regions.includes(region)} />)}</View></Card> : null}
    {step === 5 ? <Card><Text style={styles.hint}>{pick("Aucune alerte n’est activée sans votre choix explicite.", "No alert is enabled without your explicit choice.")}</Text><Choice label={pick("Résultats à venir", "Upcoming earnings")} onPress={() => setDraft((current) => ({ ...current, alertTemplates: toggle(current.alertTemplates, "earnings_upcoming") as OnboardingDraft["alertTemplates"] }))} selected={draft.alertTemplates.includes("earnings_upcoming")} /><Choice label={pick("Nouvelles de société", "Company news")} onPress={() => setDraft((current) => ({ ...current, alertTemplates: toggle(current.alertTemplates, "company_news") as OnboardingDraft["alertTemplates"] }))} selected={draft.alertTemplates.includes("company_news")} /></Card> : null}
    {step === 6 ? <Card>{summary.map((item) => <Text key={item} style={styles.summary}>✓ {item}</Text>)}</Card> : null}

    <View style={styles.actions}>{step > 0 ? <Button label={pick("Retour", "Back")} onPress={() => setStep((value) => value - 1)} variant="secondary" /> : null}<Button disabled={!canContinue} label={step === 6 ? pick("Commencer", "Get started") : pick("Continuer", "Continue")} onPress={() => step === 6 ? void finish() : setStep((value) => value + 1)} /></View>
  </Screen>;
}

const styles = StyleSheet.create({
  top: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, progress: { ...typography.label, color: colors.primary }, skip: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md }, skipText: { ...typography.label, color: colors.textMuted },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm }, choice: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised }, choiceActive: { borderColor: colors.primary, backgroundColor: "rgba(44,156,255,.2)" }, choiceText: { ...typography.body, color: colors.textMuted }, choiceTextActive: { color: colors.text, fontWeight: "800" }, hint: { ...typography.caption, color: colors.textMuted }, summary: { ...typography.body, color: colors.text }, actions: { gap: spacing.sm },
});
