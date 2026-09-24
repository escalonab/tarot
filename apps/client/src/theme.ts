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

/** Board cell size in CSS px at zoom 1. Cards fill the cell minus a small gap. */
export const CELL = 96;
export const CARD = 88;
