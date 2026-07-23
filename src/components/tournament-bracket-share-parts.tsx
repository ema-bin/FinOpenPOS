"use client";

import { Trophy } from "lucide-react";
import { formatTime } from "@/lib/date-utils";

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

const DAY_SHORT = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

export const LINE_STROKE = 2;
export const LINE_COLOR = "rgba(255, 255, 255, 0.9)";

export type LineSegment = { left: number; top: number; width: number; height: number };

export function formatCompactSchedule(
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

export function formatTimeOnly(time: string | null | undefined): string {
  const t = formatTime(time);
  return t ? `${t}\u00A0HS` : "";
}

export function bracketPathToSegments(
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

export function BracketTrophyIcon({ className }: { className?: string }) {
  return (
    <Trophy
      className={className}
      strokeWidth={2.5}
      fill="#ffb300"
      stroke="#fff8e1"
      aria-hidden
    />
  );
}

export function ShareBracketMatchSlot({
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
      <div className={`minimal-time-box${isFinal ? " minimal-time-box--final" : ""}`}>
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
