"use client";

/**
 * Cuadro de playoffs minimalista solo para «Compartir».
 * Sin react-brackets: layout propio, estilo tipo flyer azul.
 */

import React, { useMemo } from "react";
import { formatTime } from "@/lib/date-utils";
import "./playoffs-bracket-minimal.css";

export type ShareBracketMatch = {
  id: number;
  round: string;
  bracketPos: number;
  team1: { id: number; name: string } | null;
  team2: { id: number; name: string } | null;
  winner?: { id: number } | null;
  isFinished: boolean;
  isBye?: boolean;
  scores?: string;
  sourceTeam1?: string | null;
  sourceTeam2?: string | null;
  matchDate?: string | null;
  startTime?: string | null;
};

type BracketShareProps = {
  rounds: string[];
  matchesByRound: Record<string, ShareBracketMatch[]>;
  tournamentName: string;
  tournamentCategory?: string | null;
  isCategorySpecific?: boolean;
  isPuntuable?: boolean;
};

function formatCategoryHeaderLabel(category: string): string {
  const trimmed = category.trim();
  if (!trimmed) return "";
  if (/\bCAT\.?$/i.test(trimmed)) return trimmed;
  return `${trimmed} CAT`;
}

const DAY_SHORT = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

const SLOT_UNIT = 38;
/** Altura de un partido en la 1ª ronda (2 cajas + horario). */
const FIRST_ROUND_SLOT = SLOT_UNIT * 2 + 3 + 18 + 3 + SLOT_UNIT * 2;
const COL_W_FIRST = 332;
const COL_W_LATE = 112;
const COL_GAP = 16;

function getColWidth(roundIndex: number): number {
  return roundIndex === 0 ? COL_W_FIRST : COL_W_LATE;
}

function getColLeft(roundIndex: number): number {
  if (roundIndex <= 0) return 0;
  return COL_W_FIRST + COL_GAP + (roundIndex - 1) * (COL_W_LATE + COL_GAP);
}

function getColRight(roundIndex: number): number {
  return getColLeft(roundIndex) + getColWidth(roundIndex);
}

function formatCompactSchedule(
  date: string | null | undefined,
  time: string | null | undefined,
): string {
  if (!date && !time) return "";
  let dayPart = "";
  if (date) {
    const d = new Date(date.includes("T") ? date : `${date}T00:00:00`);
    if (!isNaN(d.getTime())) dayPart = DAY_SHORT[d.getDay()] ?? "";
  }
  const t = formatTime(time);
  if (dayPart && t) return `${dayPart} ${t}`;
  return dayPart || t;
}

/** Solo horario para rondas posteriores (ej. «17:00 HS»). */
function formatTimeOnly(time: string | null | undefined): string {
  const t = formatTime(time);
  return t ? `${t}\u00A0HS` : "";
}

/** Cada ronda duplica el alto del slot para centrar con la ronda anterior. */
function getSlotMinHeight(roundIndex: number): number {
  return FIRST_ROUND_SLOT * Math.pow(2, roundIndex);
}

function getBracketBodyHeight(
  rounds: string[],
  matchesByRound: Record<string, ShareBracketMatch[]>,
): number {
  const firstCount = matchesByRound[rounds[0]]?.length ?? 1;
  return getSlotMinHeight(0) * firstCount;
}

function slotCenterY(
  roundIndex: number,
  matchIndex: number,
  rounds: string[],
  matchesByRound: Record<string, ShareBracketMatch[]>,
): number {
  const totalH = getBracketBodyHeight(rounds, matchesByRound);
  const matchCount = matchesByRound[rounds[roundIndex]]?.length ?? 1;
  const slotH = totalH / matchCount;
  return matchIndex * slotH + slotH / 2;
}

const LINE_STROKE = 3;
const LINE_COLOR = "rgba(255, 255, 255, 0.9)";

type LineSegment = { left: number; top: number; width: number; height: number };

/** Segmentos HTML (exportan bien con html-to-image; el SVG con var() no). */
function bracketPathToSegments(
  x0: number,
  y0: number,
  xMid: number,
  y1: number,
  x2: number,
): LineSegment[] {
  const t = LINE_STROKE / 2;
  return [
    { left: x0, top: y0 - t, width: xMid - x0, height: LINE_STROKE },
    {
      left: xMid - t,
      top: Math.min(y0, y1),
      width: LINE_STROKE,
      height: Math.abs(y1 - y0) || LINE_STROKE,
    },
    { left: xMid, top: y1 - t, width: x2 - xMid, height: LINE_STROKE },
  ];
}

function buildConnectorSegments(
  rounds: string[],
  matchesByRound: Record<string, ShareBracketMatch[]>,
): LineSegment[] {
  const segments: LineSegment[] = [];
  for (let r = 0; r < rounds.length - 1; r++) {
    const m0 = matchesByRound[rounds[r]]?.length ?? 0;
    for (let i = 0; i < m0; i++) {
      const y0 = slotCenterY(r, i, rounds, matchesByRound);
      const j = Math.floor(i / 2);
      const y1 = slotCenterY(r + 1, j, rounds, matchesByRound);
      const x0 = getColRight(r);
      const xMid = x0 + COL_GAP / 2;
      const x2 = getColLeft(r + 1);
      segments.push(...bracketPathToSegments(x0, y0, xMid, y1, x2));
    }
  }
  return segments;
}

function MatchSlot({
  match,
  isFirstRound,
  isFinal,
}: {
  match: ShareBracketMatch;
  isFirstRound: boolean;
  isFinal: boolean;
}) {
  if (!isFirstRound) {
    const timeLabel = formatTimeOnly(match.startTime);
    return (
      <div
        className={`minimal-time-box${isFinal ? " minimal-time-box--final" : ""}`}
      >
        {timeLabel || "—"}
      </div>
    );
  }

  const schedule = formatCompactSchedule(match.matchDate, match.startTime);
  const team1 = match.team1?.name?.trim() || "";
  const team2 = match.team2?.name?.trim() || "";
  const hasTeam1 = team1.length > 0 && team1 !== "—";
  const hasTeam2 = team2.length > 0 && team2 !== "—";
  const team1Winner =
    match.winner && match.team1 && match.winner.id === match.team1.id;
  const team2Winner =
    match.winner && match.team2 && match.winner.id === match.team2.id;
  const isBye =
    match.isBye ?? (hasTeam1 !== hasTeam2 && (hasTeam1 || hasTeam2));

  if (isBye) {
    const singleName = hasTeam1 ? team1 : team2;
    const singleWinner = hasTeam1 ? team1Winner : team2Winner;
    return (
      <div className="minimal-match-paired minimal-match-paired--bye">
        <div
          className={`minimal-team-box${singleWinner ? " minimal-team-box--winner" : ""}`}
        >
          {singleName}
        </div>
      </div>
    );
  }

  return (
    <div className="minimal-match-paired">
      {hasTeam1 ? (
        <div
          className={`minimal-team-box${team1Winner ? " minimal-team-box--winner" : ""}`}
        >
          {team1}
        </div>
      ) : null}
      {schedule ? <p className="minimal-match-time">{schedule}</p> : null}
      {hasTeam2 ? (
        <div
          className={`minimal-team-box${team2Winner ? " minimal-team-box--winner" : ""}`}
        >
          {team2}
        </div>
      ) : null}
    </div>
  );
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
    },
    ref,
  ) {
    const bodyHeight = useMemo(
      () => getBracketBodyHeight(rounds, matchesByRound),
      [rounds, matchesByRound],
    );
    const connectorSegments = useMemo(
      () => buildConnectorSegments(rounds, matchesByRound),
      [rounds, matchesByRound],
    );

    const name = tournamentName.trim() || "Torneo";
    const categoryLabel = tournamentCategory
      ? formatCategoryHeaderLabel(tournamentCategory)
      : "";
    const showCategoryHeader = !!isCategorySpecific && !!categoryLabel;

    return (
      <div ref={ref} className="minimal-bracket-root">
        <h2 className="minimal-bracket-title">
          {showCategoryHeader ? (
            <>
              <span>{categoryLabel}</span>
              {isPuntuable ? (
                <>
                  <span className="minimal-bracket-title-sep" aria-hidden>
                    |
                  </span>
                  <span className="minimal-bracket-title-puntuable">Puntuable</span>
                </>
              ) : null}
            </>
          ) : (
            <span>{name}</span>
          )}
        </h2>
        <div className="minimal-bracket-watermark" aria-hidden>
          <img src="/PCP-logo.png" alt="" crossOrigin="anonymous" draggable={false} />
        </div>
        <div
          className="minimal-bracket-body"
          style={{ minHeight: bodyHeight }}
        >
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
                    className={`minimal-bracket-col${isFirstRound ? " minimal-bracket-col--first" : " minimal-bracket-col--late"}`}
                  >
                    {matches.map((match) => (
                      <div
                        key={match.id}
                        className="minimal-bracket-slot"
                        style={{ minHeight: getSlotMinHeight(roundIdx) }}
                      >
                        <MatchSlot
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
