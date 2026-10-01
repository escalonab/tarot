import type { Card } from "@tarot/shared";
import { CARD_ASPECT, CARD_IMAGE_SET } from "../theme";

interface Props {
  card: Card;
  /** Rendered width in px; the height follows the artwork aspect. */
  width?: number;
  /** Which sides are currently exposed (scoring). Non-scoring edges are dimmed. */
  exposedSides?: readonly boolean[];
  className?: string;
}

const VB_W = 100;
const VB_H = VB_W / CARD_ASPECT;
const RADIUS = 5;
const BAND = 14;

// one trapezoid per side (top, right, bottom, left) covering the edge strip where the semicircle sits
const EDGE_BANDS = [
  `0,0 ${VB_W},0 ${VB_W - BAND},${BAND} ${BAND},${BAND}`,
  `${VB_W},0 ${VB_W},${VB_H} ${VB_W - BAND},${VB_H - BAND} ${VB_W - BAND},${BAND}`,
  `${VB_W},${VB_H} 0,${VB_H} ${BAND},${VB_H - BAND} ${VB_W - BAND},${VB_H - BAND}`,
  `0,${VB_H} 0,0 ${BAND},${BAND} ${BAND},${VB_H - BAND}`,
];

/** Card ids are `c<number>`; the artwork file is `<number>.jpg`. */
function cardImageUrl(card: Card): string {
  return `${import.meta.env.BASE_URL}${CARD_IMAGE_SET}/${card.id.slice(1)}.jpg`;
}

/** Pure visual of a card: its artwork, with non-scoring edges dimmed when `exposedSides` is given. */
export function CardFace({ card, width = 88, exposedSides, className }: Props) {
  return (
    <svg
      className={`card-face ${className ?? ""}`}
      width={width}
      height={width / CARD_ASPECT}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      role="img"
      aria-label={`${card.name}${card.mark ? ` (${card.mark})` : ""}: ${card.edges.join(", ")}`}
    >
      <defs>
        <clipPath id={`clip-${card.id}`}>
          <rect width={VB_W} height={VB_H} rx={RADIUS} />
        </clipPath>
      </defs>
      <g clipPath={`url(#clip-${card.id})`}>
        <image href={cardImageUrl(card)} width={VB_W} height={VB_H} preserveAspectRatio="none" />
        {exposedSides?.map((exposed, i) => !exposed && <polygon key={i} points={EDGE_BANDS[i]} fill="#0b0c12" opacity={0.6} />)}
      </g>
      <rect width={VB_W} height={VB_H} rx={RADIUS} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
    </svg>
  );
}
