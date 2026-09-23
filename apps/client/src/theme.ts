import type { Color } from "@tarot/shared";

export const COLOR_HEX: Record<Color, string> = {
  red: "#e5484d",
  blue: "#3e8ef7",
  green: "#30c26b",
  yellow: "#f5c432",
  purple: "#a262f0",
};

export const COLOR_LABEL: Record<Color, string> = {
  red: "Red",
  blue: "Blue",
  green: "Green",
  yellow: "Yellow",
  purple: "Purple",
};

/** Board cell size in CSS px at zoom 1. Cards fill the cell minus a small gap. */
export const CELL = 96;
export const CARD = 88;
