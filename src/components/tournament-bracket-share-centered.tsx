"use client";

import React, { useMemo } from "react";
import { ShareTournamentTitle } from "@/components/share-tournament-title";
import {
  ShareBracketMatchSlot,
  BracketTrophyIcon,
  formatTimeOnly,
  LINE_COLOR,
  bracketPathToSegments,
  type LineSegment,
  type ShareBracketMatch,
} from "@/components/tournament-bracket-share-parts";
import {
  BRACKET_SHARE_LAYOUT_CENTERED,
  BRACKET_SHARE_LAYOUT_PLAYOFFS_CENTERED,
  bracketLayoutCssVars,
  getFirstRoundSlotHeight,
  type BracketShareLayout,
} from "@/lib/playoffs-bracket-share-layout";
import "./playoffs-bracket-minimal.css";

export type { ShareBracketMatch } from "@/components/tournament-bracket-share-parts";

export type CenteredBracketShareVariant = "preview" | "playoffs";

type CenteredBracketProps = {
  rounds: string[];
  matchesByRound: Record<string, ShareBracketMatch[]>;
  tournamentName: string;
  tournamentCategory?: string | null;
  isCategorySpecific?: boolean;
  isPuntuable?: boolean;
  layout?: BracketShareLayout;
  /** preview: tipografía grande. playoffs: tipografía más chica, sin horario en final. */
  shareVariant?: CenteredBracketShareVariant;
};

type CenteredColumn = {
  side: "left" | "center" | "right";
  roundKey: string;
  roundDepth: number;
  matches: ShareBracketMatch[];
};

function sortedMatches(
  matchesByRound: Record<string, ShareBracketMatch[]>,
  round: string,
): ShareBracketMatch[] {
  return [...(matchesByRound[round] ?? [])].sort(
    (a, b) => (a.bracketPos ?? 999) - (b.bracketPos ?? 999),
  );
}

function buildCenteredColumns(
  rounds: string[],
  matchesByRound: Record<string, ShareBracketMatch[]>,
): CenteredColumn[] {
  const preFinal = rounds.filter((r) => r !== "final");
  const cols: CenteredColumn[] = [];

  preFinal.forEach((round, roundDepth) => {
    const all = sortedMatches(matchesByRound, round);
    const half = Math.ceil(all.length / 2);
    cols.push({
      side: "left",
      roundKey: round,
      roundDepth,
      matches: all.slice(0, half),
    });
  });

  const finalMatches = sortedMatches(matchesByRound, "final");
  if (finalMatches.length) {
    cols.push({
      side: "center",
      roundKey: "final",
      roundDepth: 0,
      matches: finalMatches,
    });
  }

  for (let roundDepth = preFinal.length - 1; roundDepth >= 0; roundDepth--) {
    const round = preFinal[roundDepth];
    const all = sortedMatches(matchesByRound, round);
    const half = Math.ceil(all.length / 2);
    cols.push({
      side: "right",
      roundKey: round,
      roundDepth,
      matches: all.slice(half),
    });
  }

  return cols;
}

function isOuterRoundColumn(col: CenteredColumn): boolean {
  return col.side !== "center" && col.roundDepth === 0;
}

function getColumnWidth(col: CenteredColumn, layout: BracketShareLayout): number {
  if (col.side === "center") return layout.colWLate + 6;
  return isOuterRoundColumn(col) ? layout.colWFirst : layout.colWLate;
}

function computeColumnLayout(
  columns: CenteredColumn[],
  layout: BracketShareLayout,
): Array<{ col: CenteredColumn; left: number; width: number }> {
  let x = 0;
  const result: Array<{ col: CenteredColumn; left: number; width: number }> = [];
  for (const col of columns) {
    const width = getColumnWidth(col, layout);
    result.push({ col, left: x, width });
    x += width + layout.colGap;
  }
  return result;
}

function getSideSlotMinHeight(roundDepth: number, layout: BracketShareLayout): number {
  return getFirstRoundSlotHeight(layout) * Math.pow(2, roundDepth);
}

function getCenteredBodyHeight(
  rounds: string[],
  matchesByRound: Record<string, ShareBracketMatch[]>,
  layout: BracketShareLayout,
): number {
  const firstRound = rounds.find((r) => r !== "final");
  if (!firstRound) return getFirstRoundSlotHeight(layout);
  const firstCount = matchesByRound[firstRound]?.length ?? 1;
  const perSide = Math.max(1, Math.ceil(firstCount / 2));
  return getFirstRoundSlotHeight(layout) * perSide;
}

function slotCenterY(
  roundDepth: number,
  matchIndex: number,
  matchCount: number,
  bodyHeight: number,
  layout: BracketShareLayout,
): number {
  const slotH = getSideSlotMinHeight(roundDepth, layout);
  const totalSlots = bodyHeight / slotH;
  if (matchCount >= totalSlots) {
    return matchIndex * slotH + slotH / 2;
  }
  const regionH = bodyHeight / matchCount;
  return matchIndex * regionH + regionH / 2;
}

function connectorSegmentsForward(
  x0: number,
  y0: number,
  x2: number,
  y1: number,
  gap: number,
): LineSegment[] {
  const xMid = x0 + gap / 2;
  return bracketPathToSegments(x0, y0, xMid, y1, x2);
}

function connectorSegmentsBackward(
  x0: number,
  y0: number,
  x2: number,
  y1: number,
  gap: number,
): LineSegment[] {
  const xMid = x0 - gap / 2;
  return bracketPathToSegments(x2, y1, xMid, y0, x0);
}

function buildCenteredConnectorSegments(
  columnLayout: Array<{ col: CenteredColumn; left: number; width: number }>,
  preFinalCount: number,
  bodyHeight: number,
  layout: BracketShareLayout,
): LineSegment[] {
  const segments: LineSegment[] = [];
  const colBySideDepth = new Map<string, { left: number; width: number; col: CenteredColumn }>();

  columnLayout.forEach((entry) => {
    if (entry.col.side === "center") return;
    colBySideDepth.set(`${entry.col.side}-${entry.col.roundDepth}`, entry);
  });

  const centerCol = columnLayout.find((c) => c.col.side === "center");

  for (let depth = 0; depth < preFinalCount - 1; depth++) {
    const leftOuter = colBySideDepth.get(`left-${depth}`);
    const leftInner = colBySideDepth.get(`left-${depth + 1}`);
    if (leftOuter && leftInner) {
      const m0 = leftOuter.col.matches.length;
      for (let i = 0; i < m0; i++) {
        const y0 = slotCenterY(depth, i, m0, bodyHeight, layout);
        const j = Math.floor(i / 2);
        const y1 = slotCenterY(depth + 1, j, leftInner.col.matches.length, bodyHeight, layout);
        segments.push(
          ...connectorSegmentsForward(
            leftOuter.left + leftOuter.width,
            y0,
            leftInner.left,
            y1,
            layout.colGap,
          ),
        );
      }
    }

    const rightOuter = colBySideDepth.get(`right-${depth}`);
    const rightInner = colBySideDepth.get(`right-${depth + 1}`);
    if (rightOuter && rightInner) {
      const m0 = rightOuter.col.matches.length;
      for (let i = 0; i < m0; i++) {
        const y0 = slotCenterY(depth, i, m0, bodyHeight, layout);
        const j = Math.floor(i / 2);
        const y1 = slotCenterY(depth + 1, j, rightInner.col.matches.length, bodyHeight, layout);
        segments.push(
          ...connectorSegmentsBackward(
            rightOuter.left,
            y0,
            rightInner.left + rightInner.width,
            y1,
            layout.colGap,
          ),
        );
      }
    }
  }

  if (centerCol && preFinalCount > 0) {
    const leftSemi = colBySideDepth.get(`left-${preFinalCount - 1}`);
    const rightSemi = colBySideDepth.get(`right-${preFinalCount - 1}`);
    const yFinal = bodyHeight / 2;

    if (leftSemi && leftSemi.col.matches.length > 0) {
      const y0 = slotCenterY(
        preFinalCount - 1,
        0,
        leftSemi.col.matches.length,
        bodyHeight,
        layout,
      );
      segments.push(
        ...connectorSegmentsForward(
          leftSemi.left + leftSemi.width,
          y0,
          centerCol.left,
          yFinal,
          layout.colGap,
        ),
      );
    }

    if (rightSemi && rightSemi.col.matches.length > 0) {
      const y0 = slotCenterY(
        preFinalCount - 1,
        0,
        rightSemi.col.matches.length,
        bodyHeight,
        layout,
      );
      segments.push(
        ...connectorSegmentsBackward(
          rightSemi.left,
          y0,
          centerCol.left + centerCol.width,
          yFinal,
          layout.colGap,
        ),
      );
    }
  }

  return segments;
}

export const TournamentBracketShareCentered = React.forwardRef<
  HTMLDivElement,
  CenteredBracketProps
>(function TournamentBracketShareCentered(
  {
    rounds,
    matchesByRound,
    tournamentName,
    tournamentCategory,
    isCategorySpecific,
      isPuntuable,
      layout: layoutProp,
      shareVariant = "preview",
    },
    ref,
  ) {
  const defaultLayout =
    shareVariant === "playoffs"
      ? BRACKET_SHARE_LAYOUT_PLAYOFFS_CENTERED
      : BRACKET_SHARE_LAYOUT_CENTERED;
  const layout = layoutProp ?? defaultLayout;
  const showTrophy = true;
  const layoutStyle = bracketLayoutCssVars(layout);
  const preFinalCount = rounds.filter((r) => r !== "final").length;

  const columns = useMemo(
    () => buildCenteredColumns(rounds, matchesByRound),
    [rounds, matchesByRound],
  );

  const columnLayout = useMemo(
    () => computeColumnLayout(columns, layout),
    [columns, layout],
  );

  const bodyHeight = useMemo(
    () => getCenteredBodyHeight(rounds, matchesByRound, layout),
    [rounds, matchesByRound, layout],
  );

  const connectorSegments = useMemo(
    () =>
      buildCenteredConnectorSegments(columnLayout, preFinalCount, bodyHeight, layout),
    [columnLayout, preFinalCount, bodyHeight, layout],
  );

  const centerColEntry = useMemo(
    () => columnLayout.find((c) => c.col.side === "center"),
    [columnLayout],
  );

  const finalSchedule = useMemo(() => {
    const finalMatch = matchesByRound.final?.[0];
    if (!finalMatch) return "";
    return formatTimeOnly(finalMatch.startTime);
  }, [matchesByRound]);

  return (
    <div
      ref={ref}
      className={`minimal-bracket-root minimal-bracket-root--centered minimal-bracket-root--share-${shareVariant}`}
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

        {showTrophy && centerColEntry ? (
          <div
            className={`minimal-bracket-trophy minimal-bracket-trophy--overlay minimal-bracket-trophy--${shareVariant}`}
            style={{
              left: centerColEntry.left + centerColEntry.width / 2,
              top: bodyHeight / 2,
            }}
            aria-hidden
          >
            <BracketTrophyIcon />
            {shareVariant === "playoffs" && finalSchedule ? (
              <p className="minimal-bracket-final-schedule">{finalSchedule}</p>
            ) : null}
          </div>
        ) : null}

        <div className="minimal-bracket-cols minimal-bracket-cols--centered">
          {columnLayout.map(({ col, width }, idx) => {
            const isFirstRound = isOuterRoundColumn(col);
            const isFinal = col.side === "center";
            const slotH =
              col.side === "center"
                ? bodyHeight
                : getSideSlotMinHeight(col.roundDepth, layout);

            return (
              <React.Fragment key={`${col.side}-${col.roundKey}-${idx}`}>
                {idx > 0 ? <div className="minimal-bracket-gap" aria-hidden /> : null}
                <div
                  className={`minimal-bracket-col${
                    isFirstRound
                      ? " minimal-bracket-col--first"
                      : isFinal
                        ? " minimal-bracket-col--final"
                        : " minimal-bracket-col--late"
                  }`}
                  style={!isFirstRound ? { width } : undefined}
                >
                  {col.matches.map((match) => (
                    <div
                      key={match.id}
                      className={`minimal-bracket-slot${
                        isFinal ? " minimal-bracket-slot--final-center" : ""
                      }`}
                      style={{ minHeight: slotH }}
                    >
                      <ShareBracketMatchSlot
                        match={match}
                        isFirstRound={isFirstRound || isFinal}
                        isFinal={isFinal}
                        hideFinalSchedule={isFinal && shareVariant === "playoffs"}
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
});

TournamentBracketShareCentered.displayName = "TournamentBracketShareCentered";
