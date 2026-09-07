import { colors } from "./palettes";

export {
  colors,
  createThemedStyles,
  mobilePalettes,
  originalPalette,
  skyPalette,
  type MobileThemeName,
  type ThemeColors,
} from "./palettes";

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

export const typography = {
  hero: { fontSize: 32, lineHeight: 38, fontWeight: "800" as const },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "800" as const },
  section: { fontSize: 17, lineHeight: 22, fontWeight: "700" as const },
  body: { fontSize: 15, lineHeight: 21, fontWeight: "400" as const },
  label: { fontSize: 12, lineHeight: 16, fontWeight: "700" as const },
  caption: { fontSize: 11, lineHeight: 15, fontWeight: "500" as const },
} as const;

export const shadows = {
  card: {
    get shadowColor() { return colors.shadow; },
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 4,
  },
} as const;
