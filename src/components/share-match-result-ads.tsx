import {
  hasMatchResultAds,
  matchResultAdRowDefs,
  type MatchResultAdRows,
} from "@/lib/share-match-result-ads";
import { cn } from "@/lib/utils";
import "./share-match-result-ads.css";

type ShareMatchResultAdsBlockProps = {
  rows: MatchResultAdRows;
  placement: "top" | "bottom";
  className?: string;
};

export function ShareMatchResultAdsBlock({
  rows,
  placement,
  className,
}: ShareMatchResultAdsBlockProps) {
  if (!hasMatchResultAds(rows)) return null;

  const rowDefs = matchResultAdRowDefs(rows).filter((row) =>
    placement === "top" ? row.variant === "top" : row.variant === "bottom"
  );

  if (rowDefs.length === 0) return null;

  return (
    <div
      className={cn(
        "match-result-ads",
        placement === "top" ? "match-result-ads--top" : "match-result-ads--bottom",
        className
      )}
    >
      {rowDefs.map(({ ads, variant }, index) => (
        <div key={`${placement}-${index}`} className="match-result-ads-row">
          {ads.map((ad) => (
            <div
              key={ad.id}
              className={cn(
                "match-result-ad-cell",
                variant === "top" ? "match-result-ad-cell--top" : "match-result-ad-cell--bottom"
              )}
            >
              <img
                src={ad.image_url}
                alt={ad.name}
                className="match-result-ad-img"
                crossOrigin="anonymous"
                draggable={false}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
