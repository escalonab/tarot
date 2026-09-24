import type { Card } from "@tarot/shared";
import { COLOR_HEX } from "../theme";

interface Props {
  card: Card;
  size?: number;
  /** Which sides are currently exposed (scoring). Drawn with a glow. */
  exposedSides?: readonly boolean[];
  className?: string;
}

const TRIANGLES = [
  "2,2 98,2 50,50", // top
  "98,2 98,98 50,50", // right
  "98,98 2,98 50,50", // bottom
  "2,98 2,2 50,50", // left
];

const MARK_GLYPH = { star: "\u2605", crown: "\u265B" } as const;

/** Pure visual of a card: four coloured triangles with a placeholder name label where the artwork goes. */
export function CardFace({ card, size = 88, exposedSides, className }: Props) {
  return (
    <svg
      className={`card-face ${className ?? ""}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`${card.name}${card.mark ? ` (${card.mark})` : ""}: ${card.edges.join(", ")}`}
    >
      <defs>
        <clipPath id={`clip-${card.id}`}>
          <rect x="2" y="2" width="96" height="96" rx="10" />
        </clipPath>
      </defs>
      <g clipPath={`url(#clip-${card.id})`}>
        {card.edges.map((color, i) => (
          <polygon
            key={i}
            points={TRIANGLES[i]}
            fill={COLOR_HEX[color]}
            stroke="rgba(0,0,0,0.25)"
            strokeWidth="0.6"
            opacity={exposedSides && !exposedSides[i] ? 0.55 : 1}
          />
        ))}
      </g>
      <rect x="2" y="2" width="96" height="96" rx="10" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="2" />
      {card.mark && (
        <>
          <circle cx="50" cy="27" r="9" fill="#12131a" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" />
          <text x="50" y="31" textAnchor="middle" fontSize="11" fill={card.mark === "crown" ? "#f5c432" : "#e8e9f0"}>
            {MARK_GLYPH[card.mark]}
          </text>
        </>
      )}
      <rect x="10" y="40" width="80" height="20" rx="6" fill="#12131a" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" />
      <text x="50" y="54" textAnchor="middle" fontSize="10" fontWeight="600" fill="#e8e9f0">
        {card.name}
      </text>
    </svg>
  );
}
