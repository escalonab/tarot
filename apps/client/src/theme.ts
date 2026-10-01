import type { EdgeColor } from "@tarot/shared";

export const COLOR_HEX: Record<EdgeColor, string> = {
  red: "#e5484d",
  blue: "#3e8ef7",
  green: "#30c26b",
  yellow: "#f5c432",
  white: "#f1f2f6",
  black: "#15161c",
};

export const COLOR_LABEL: Record<EdgeColor, string> = {
  red: "Red",
  blue: "Blue",
  green: "Green",
  yellow: "Yellow",
  white: "White",
  black: "Black",
};

/** Folder under public/ with the card artwork (one file per card number); swap it to change the artwork variant. */
export const CARD_IMAGE_SET = "cards_original";
/** Width / height of the processed card artwork. */
export const CARD_ASPECT = 600 / 843;

/** Board card size in CSS px at zoom 1; a cell is the card plus a small gap. */
export const CARD_W = 100;
export const CARD_H = Math.round(CARD_W / CARD_ASPECT);
const GAP = 8;
export const CELL_W = CARD_W + GAP;
export const CELL_H = CARD_H + GAP;
