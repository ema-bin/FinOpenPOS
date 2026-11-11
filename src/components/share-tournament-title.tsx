"use client";

import { useLayoutEffect, useRef } from "react";
import {
  fittedFontSizePx,
  formatCategoryHeaderLabel,
  shouldShowCategoryShareHeader,
} from "@/lib/share-tournament-header";

type ShareTournamentTitleProps = {
  tournamentName: string;
  tournamentCategory?: string | null;
  isCategorySpecific?: boolean;
  isPuntuable?: boolean;
  className?: string;
};

export function ShareTournamentTitle({
  tournamentName,
  tournamentCategory,
  isCategorySpecific,
  isPuntuable,
  className = "",
}: ShareTournamentTitleProps) {
  const name = tournamentName.trim() || "Torneo";
  const categoryLabel = formatCategoryHeaderLabel(tournamentCategory ?? "");
  const showCategoryHeader = shouldShowCategoryShareHeader(
    isCategorySpecific,
    tournamentCategory,
  );
  const stackedCategoryPuntuable = showCategoryHeader && !!isPuntuable;
  const titleLayoutClass = stackedCategoryPuntuable
    ? "share-capture-title--stacked"
    : "share-capture-title--single";
  const titleRef = useRef<HTMLHeadingElement>(null);
  const visibleLabel = showCategoryHeader ? categoryLabel : name;

  useLayoutEffect(() => {
    const title = titleRef.current;
    const header = title?.closest(".share-group-schedule-header-text");
    if (!title || !(header instanceof HTMLElement)) return;

    let cachedMax = 0;
    let cachedWidth = 0;

    const readMaxPx = () => {
      const host = title.closest(".share-group-standings-root, .share-group-schedule-root");
      const styles = getComputedStyle(host instanceof HTMLElement ? host : title);
      const raw = (
        styles.getPropertyValue("--st-title") || styles.getPropertyValue("--sch-title")
      ).trim();
      const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      if (raw.endsWith("rem")) return parseFloat(raw) * rootFont;
      if (raw.endsWith("px")) return parseFloat(raw);
      if (!title.style.getPropertyValue("--share-title-fit")) {
        return parseFloat(getComputedStyle(title).fontSize);
      }
      return 35.2;
    };

    const measureWidth = () => {
      const lines = title.querySelectorAll(".share-capture-title-line, :scope > span");
      let textWidth = 0;
      lines.forEach((line) => {
        textWidth = Math.max(textWidth, line.scrollWidth);
      });
      return textWidth;
    };

    const fit = () => {
      const maxPx = readMaxPx();
      const pad =
        parseFloat(getComputedStyle(title).paddingLeft) +
        parseFloat(getComputedStyle(title).paddingRight);
      const available = header.clientWidth - pad - 2;
      if (!Number.isFinite(maxPx) || maxPx <= 0 || available <= 0) return;

      if (cachedMax !== maxPx) {
        title.style.setProperty("--share-title-fit", `${maxPx}px`);
        cachedWidth = measureWidth();
        cachedMax = maxPx;
      }

      const size = fittedFontSizePx(cachedWidth, available, maxPx, 16);
      const next = size < maxPx - 0.5 ? `${size}px` : "";
      const current = title.style.getPropertyValue("--share-title-fit");
      if (next) {
        if (current !== next) title.style.setProperty("--share-title-fit", next);
      } else if (current) {
        title.style.removeProperty("--share-title-fit");
      }
    };

    fit();
    const root = title.closest(".share-portrait-capture");
    const classObserver = new MutationObserver(fit);
    if (root) classObserver.observe(root, { attributes: true, attributeFilter: ["class"] });
    const resizeObserver = new ResizeObserver(fit);
    resizeObserver.observe(header);
    return () => {
      classObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, [visibleLabel, stackedCategoryPuntuable]);

  return (
    <h2
      ref={titleRef}
      className={`share-capture-title ${titleLayoutClass} ${className}`.trim()}
    >
      {showCategoryHeader ? (
        stackedCategoryPuntuable ? (
          <span className="share-capture-title-lines">
            <span className="share-capture-title-line">{categoryLabel}</span>
            <span className="share-capture-title-line share-capture-title-puntuable">
              Puntuable
            </span>
          </span>
        ) : (
          <span>{categoryLabel}</span>
        )
      ) : (
        <span>{name}</span>
      )}
    </h2>
  );
}
