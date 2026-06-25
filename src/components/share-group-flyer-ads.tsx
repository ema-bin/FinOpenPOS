import type { GroupFlyerAdRows } from "@/lib/share-group-flyer-ads";
import { hasGroupFlyerAds } from "@/lib/share-group-flyer-ads";

type ShareGroupFlyerAdsBlockProps = {
  rows: GroupFlyerAdRows;
  placement: "top" | "bottom";
  variant: "schedule" | "standings";
};

export function ShareGroupFlyerAdsBlock({
  rows,
  placement,
  variant,
}: ShareGroupFlyerAdsBlockProps) {
  if (!hasGroupFlyerAds(rows)) return null;

  const base =
    variant === "schedule" ? "share-group-schedule" : "share-group-standings";
  const rowDefs = [
    { ads: rows.row1, rowClass: `${base}-ads-row--3` },
    { ads: rows.row2, rowClass: `${base}-ads-row--3` },
    { ads: rows.row3, rowClass: `${base}-ads-row--4` },
  ].filter((row) => row.ads.length > 0);

  return (
    <div className={`${base}-ads ${base}-ads--${placement}`}>
      {rowDefs.map(({ ads, rowClass }, index) => (
        <div
          key={`${placement}-${index}`}
          className={`${base}-ads-row ${rowClass}`}
        >
          {ads.map((ad) => (
            <div key={ad.id} className={`${base}-ad-cell`}>
              <img
                src={ad.image_url}
                alt={ad.name}
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
