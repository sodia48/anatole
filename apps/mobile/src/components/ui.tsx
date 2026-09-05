import type { PropsWithChildren, ReactNode } from "react";
import * as Haptics from "expo-haptics";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, type TextInputProps, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { OfflineBadge } from "@/src/components/dataQuality";
import { shouldSuppressQueryError } from "@/src/lib/api/base";
import { useLocale } from "@/src/lib/i18n";
import { colors, radius, spacing, typography } from "@/src/theme/tokens";

export function Screen({ children, refreshing = false, onRefresh, testID }: PropsWithChildren<{ refreshing?: boolean; onRefresh?: () => void; testID?: string }>) {
  return (
    <SafeAreaView edges={["top"]} style={styles.safe} testID={testID}>
      <KeyboardAvoidingView style={styles.safe} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={styles.screen}
          keyboardShouldPersistTaps="handled"
          refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined}
        >
          <OfflineBadge />
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function ScreenHeader({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow.toUpperCase()}</Text> : null}
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action}
    </View>
  );
}

export function Card({ children, title, action, testID }: PropsWithChildren<{ title?: string; action?: ReactNode; testID?: string }>) {
  return (
    <View style={styles.card} testID={testID}>
      {title || action ? <View style={styles.cardHeader}>{title ? <Text style={styles.cardTitle}>{title}</Text> : <View />}{action}</View> : null}
      {children}
    </View>
  );
}

export function Button({ label, onPress, variant = "primary", disabled = false, accessibilityLabel }: { label: string; onPress: () => void; variant?: "primary" | "secondary" | "danger"; disabled?: boolean; accessibilityLabel?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={() => { void Haptics.selectionAsync(); onPress(); }}
      style={({ pressed }) => [styles.button, variant === "secondary" && styles.buttonSecondary, variant === "danger" && styles.buttonDanger, pressed && styles.buttonPressed, disabled && styles.buttonDisabled]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  return <View style={styles.field}><Text style={styles.fieldLabel}>{props.label}</Text><TextInput placeholderTextColor={colors.textSubtle} {...props} style={[styles.input, props.style]} /></View>;
}

export function Change({ value, suffix = "%" }: { value: number; suffix?: string }) {
  const positive = value >= 0;
  return <Text accessibilityLabel={`${positive ? "plus" : "moins"} ${Math.abs(value).toFixed(2)} ${suffix}`} style={[styles.change, { color: positive ? colors.positive : colors.negative }]}>{positive ? "+" : ""}{value.toFixed(2)} {suffix}</Text>;
}

export function QueryState({ loading, error, empty, onRetry }: { loading: boolean; error?: Error | null; empty?: boolean; onRetry?: () => void }) {
  const { t } = useLocale();
  if (loading) return <View accessibilityLabel={t("loading")} style={styles.skeletonState}><View style={styles.skeletonWide} /><View style={styles.skeletonShort} /><ActivityIndicator color={colors.primary} /></View>;
  if (shouldSuppressQueryError(error)) return null;
  if (error) return <View style={styles.state}><Text style={styles.error}>{error.message}</Text>{onRetry ? <Button label={t("retry")} onPress={onRetry} variant="secondary" /> : null}</View>;
  if (empty) return <View style={styles.state}><Text style={styles.muted}>{t("noData")}</Text></View>;
  return null;
}

export const uiStyles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  stack: { gap: spacing.md },
  label: { ...typography.label, color: colors.textMuted },
  value: { fontSize: 22, lineHeight: 28, fontWeight: "800", color: colors.text },
  muted: { ...typography.caption, color: colors.textMuted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.sm },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  screen: { padding: spacing.lg, paddingBottom: 120, gap: spacing.md, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, marginBottom: spacing.sm },
  headerCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { ...typography.label, color: colors.primary, letterSpacing: 1.2 },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted },
  card: { gap: spacing.md, padding: spacing.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  cardTitle: { ...typography.section, color: colors.text },
  button: { minHeight: 48, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.lg, borderRadius: radius.md, backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.borderStrong },
  buttonDanger: { backgroundColor: "#5e1730", borderWidth: 1, borderColor: colors.negative },
  buttonPressed: { opacity: 0.78 },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { ...typography.label, color: colors.text, fontSize: 14 },
  field: { gap: spacing.xs },
  fieldLabel: { ...typography.label, color: colors.textMuted },
  input: { minHeight: 48, paddingHorizontal: spacing.md, color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  change: { ...typography.label, fontSize: 14 },
  state: { minHeight: 120, alignItems: "center", justifyContent: "center", gap: spacing.md, padding: spacing.lg },
  skeletonState: { minHeight: 120, justifyContent: "center", gap: spacing.sm, padding: spacing.lg },
  skeletonWide: { height: 18, width: "86%", borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  skeletonShort: { height: 14, width: "55%", borderRadius: radius.sm, backgroundColor: colors.surfaceRaised },
  muted: { ...typography.body, color: colors.textMuted, textAlign: "center" },
  error: { ...typography.body, color: colors.negative, textAlign: "center" },
});
