import type { AdvertisementDTO } from "@/models/dto/advertisement";

type ShareGroupFlyerAdsBlockProps = {
  ads: AdvertisementDTO[];
  placement: "top" | "bottom";
  variant: "schedule" | "standings";
};

export function ShareGroupFlyerAdsBlock({
  ads,
  placement,
  variant,
}: ShareGroupFlyerAdsBlockProps) {
  if (ads.length === 0) return null;

  const base =
    variant === "schedule" ? "share-group-schedule" : "share-group-standings";

  return (
    <div className={`${base}-ads ${base}-ads--${placement}`}>
      <div className={`${base}-ads-row ${base}-ads-row--4`}>
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
    </div>
  );
}
