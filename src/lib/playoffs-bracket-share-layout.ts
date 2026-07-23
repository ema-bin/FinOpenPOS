/** Layout del cuadro minimalista de compartir playoffs (JS + CSS vars en el root). */

export type BracketShareLayout = {
  slotUnit: number;
  matchGap: number;
  timeBlock: number;
  colWFirst: number;
  colWLate: number;
  colGap: number;
};

/** Vista en pantalla — ultra compacta para celular. */
export const BRACKET_SHARE_LAYOUT: BracketShareLayout = {
  slotUnit: 13,
  matchGap: 0,
  timeBlock: 5,
  colWFirst: 164,
  colWLate: 48,
  colGap: 3,
};

/** Preview centrado: un poco más de espacio para tipografía legible. */
export const BRACKET_SHARE_LAYOUT_CENTERED: BracketShareLayout = {
  slotUnit: 17,
  matchGap: 1,
  timeBlock: 7,
  colWFirst: 182,
  colWLate: 54,
  colGap: 4,
};

/** Playoffs compartir (centrado): tipografía compacta. */
export const BRACKET_SHARE_LAYOUT_PLAYOFFS_CENTERED: BracketShareLayout = {
  slotUnit: 13,
  matchGap: 0,
  timeBlock: 5,
  colWFirst: 160,
  colWLate: 46,
  colGap: 3,
};

/** Al exportar imagen — tamaño pensado para WhatsApp (1080px). */
export const BRACKET_SHARE_LAYOUT_EXPORT: BracketShareLayout = {
  slotUnit: 70,
  matchGap: 6,
  timeBlock: 26,
  colWFirst: 460,
  colWLate: 152,
  colGap: 16,
};

/** Preview centrado al exportar. */
export const BRACKET_SHARE_LAYOUT_CENTERED_EXPORT: BracketShareLayout = {
  slotUnit: 72,
  matchGap: 6,
  timeBlock: 27,
  colWFirst: 440,
  colWLate: 148,
  colGap: 16,
};

/** Playoffs compartir al exportar (tipografía más chica que preview). */
export const BRACKET_SHARE_LAYOUT_PLAYOFFS_CENTERED_EXPORT: BracketShareLayout = {
  slotUnit: 42,
  matchGap: 3,
  timeBlock: 16,
  colWFirst: 320,
  colWLate: 104,
  colGap: 10,
};

export function getFirstRoundSlotHeight(layout: BracketShareLayout): number {
  const { slotUnit, matchGap, timeBlock } = layout;
  return slotUnit * 2 + matchGap + timeBlock + matchGap + slotUnit * 2;
}

export function bracketLayoutCssVars(
  layout: BracketShareLayout,
): Record<string, string> {
  return {
    "--mb-slot-unit": `${layout.slotUnit}px`,
    "--mb-match-gap": `${layout.matchGap}px`,
    "--mb-col-w-first": `${layout.colWFirst}px`,
    "--mb-col-w-late": `${layout.colWLate}px`,
    "--mb-gap-cols": `${layout.colGap}px`,
  };
}
