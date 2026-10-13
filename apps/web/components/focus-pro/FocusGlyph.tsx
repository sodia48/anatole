export function FocusGlyph({ name, size = 14, color }: { name: string; size?: number; color?: string }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    color={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <use href={`/focus-icons.svg#${name}`} />
  </svg>;
}
