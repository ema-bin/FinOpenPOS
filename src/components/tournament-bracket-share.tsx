"use client";

/**
 * Cuadro de playoffs minimalista solo para «Compartir».
 * Layout lineal (izquierda → derecha).
 */

import React, { useMemo } from "react";
import { ShareTournamentTitle } from "@/components/share-tournament-title";
import {
  ShareBracketMatchSlot,
  LINE_COLOR,
  bracketPathToSegments,
  type LineSegment,
  type ShareBracketMatch,
} from "@/components/tournament-bracket-share-parts";
import {
  BRACKET_SHARE_LAYOUT,
  bracketLayoutCssVars,
  getFirstRoundSlotHeight,
  type BracketShareLayout,
} from "@/lib/playoffs-bracket-share-layout";
import "./playoffs-bracket-minimal.css";

export type { ShareBracketMatch } from "@/components/tournament-bracket-share-parts";

type BracketShareProps = {
  rounds: string[];
  matchesByRound: Record<string, ShareBracketMatch[]>;
  tournamentName: string;
  tournamentCategory?: string | null;
  isCategorySpecific?: boolean;
  isPuntuable?: boolean;
  layout?: BracketShareLayout;
};

function getColWidth(roundIndex: number, layout: BracketShareLayout): number {
  return roundIndex === 0 ? layout.colWFirst : layout.colWLate;
}

function getColLeft(roundIndex: number, layout: BracketShareLayout): number {
  if (roundIndex <= 0) return 0;
  return (
    layout.colWFirst +
    layout.colGap +
    (roundIndex - 1) * (layout.colWLate + layout.colGap)
  );
}

function getColRight(roundIndex: number, layout: BracketShareLayout): number {
  return getColLeft(roundIndex, layout) + getColWidth(roundIndex, layout);
}

function getSlotMinHeight(roundIndex: number, layout: BracketShareLayout): number {
  return getFirstRoundSlotHeight(layout) * Math.pow(2, roundIndex);
}

function getBracketBodyHeight(
  rounds: string[],
  matchesByRound: Record<string, ShareBracketMatch[]>,
  layout: BracketShareLayout,
): number {
  const firstCount = matchesByRound[rounds[0]]?.length ?? 1;
  return getSlotMinHeight(0, layout) * firstCount;
}

function slotCenterY(
  roundIndex: number,
  matchIndex: number,
  rounds: string[],
  matchesByRound: Record<string, ShareBracketMatch[]>,
  layout: BracketShareLayout,
): number {
  const totalH = getBracketBodyHeight(rounds, matchesByRound, layout);
  const matchCount = matchesByRound[rounds[roundIndex]]?.length ?? 1;
  const slotH = totalH / matchCount;
  return matchIndex * slotH + slotH / 2;
}

function buildConnectorSegments(
  rounds: string[],
  matchesByRound: Record<string, ShareBracketMatch[]>,
  layout: BracketShareLayout,
): LineSegment[] {
  const segments: LineSegment[] = [];
  for (let r = 0; r < rounds.length - 1; r++) {
    const m0 = matchesByRound[rounds[r]]?.length ?? 0;
    for (let i = 0; i < m0; i++) {
      const y0 = slotCenterY(r, i, rounds, matchesByRound, layout);
      const j = Math.floor(i / 2);
      const y1 = slotCenterY(r + 1, j, rounds, matchesByRound, layout);
      const x0 = getColRight(r, layout);
      const xMid = x0 + layout.colGap / 2;
      const x2 = getColLeft(r + 1, layout);
      segments.push(...bracketPathToSegments(x0, y0, xMid, y1, x2));
    }
  }
  return segments;
}

export const TournamentBracketShare = React.forwardRef<HTMLDivElement, BracketShareProps>(
  function TournamentBracketShare(
    {
      rounds,
      matchesByRound,
      tournamentName,
      tournamentCategory,
      isCategorySpecific,
      isPuntuable,
      layout: layoutProp,
    },
    ref,
  ) {
    const layout = layoutProp ?? BRACKET_SHARE_LAYOUT;
    const layoutStyle = bracketLayoutCssVars(layout);

    const bodyHeight = useMemo(
      () => getBracketBodyHeight(rounds, matchesByRound, layout),
      [rounds, matchesByRound, layout],
    );
    const connectorSegments = useMemo(
      () => buildConnectorSegments(rounds, matchesByRound, layout),
      [rounds, matchesByRound, layout],
    );

    return (
      <div
        ref={ref}
        className="minimal-bracket-root"
        style={layoutStyle as React.CSSProperties}
      >
        <ShareTournamentTitle
          tournamentName={tournamentName}
          tournamentCategory={tournamentCategory}
          isCategorySpecific={isCategorySpecific}
          isPuntuable={isPuntuable}
        />
        <div className="minimal-bracket-watermark" aria-hidden>
          <img src="/PCP-logo.png" alt="" crossOrigin="anonymous" draggable={false} />
        </div>
        <div className="minimal-bracket-body" style={{ minHeight: bodyHeight }}>
          <div
            className="minimal-bracket-connectors"
            style={{ height: bodyHeight }}
            aria-hidden
          >
            {connectorSegments.map((seg, i) => (
              <div
                key={i}
                className="minimal-bracket-line"
                style={{
                  left: seg.left,
                  top: seg.top,
                  width: seg.width,
                  height: seg.height,
                  backgroundColor: LINE_COLOR,
                }}
              />
            ))}
          </div>

          <div className="minimal-bracket-cols">
            {rounds.map((round, roundIdx) => {
              const matches = [...(matchesByRound[round] || [])].sort(
                (a, b) => (a.bracketPos ?? 999) - (b.bracketPos ?? 999),
              );
              const isFirstRound = roundIdx === 0;
              const isFinal = round === "final";

              return (
                <React.Fragment key={round}>
                  {roundIdx > 0 ? <div className="minimal-bracket-gap" aria-hidden /> : null}
                  <div
                    className={`minimal-bracket-col${
                      isFirstRound ? " minimal-bracket-col--first" : " minimal-bracket-col--late"
                    }`}
                  >
                    {matches.map((match) => (
                      <div
                        key={match.id}
                        className="minimal-bracket-slot"
                        style={{ minHeight: getSlotMinHeight(roundIdx, layout) }}
                      >
                        <ShareBracketMatchSlot
                          match={match}
                          isFirstRound={isFirstRound}
                          isFinal={isFinal}
                        />
                      </div>
                    ))}
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    );
  },
);

TournamentBracketShare.displayName = "TournamentBracketShare";
