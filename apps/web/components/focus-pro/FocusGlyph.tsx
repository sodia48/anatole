import type { SVGProps } from "react";

export type FocusGlyphProps = Omit<SVGProps<SVGSVGElement>, "name" | "size"> & { name: string; size?: number | string };

export function FocusGlyph({ name, size = 14, color, fill = "none", stroke = "currentColor", strokeWidth = 2, ...props }: FocusGlyphProps) {
  return <svg {...props} width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={stroke}
    color={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
    aria-hidden={props["aria-hidden"] ?? (props["aria-label"] ? undefined : true)} focusable="false">
    <use href={`/focus-icons.svg#${name}`} />
  </svg>;
}
