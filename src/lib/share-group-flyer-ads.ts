import type { AdvertisementDTO } from "@/models/dto/advertisement";

/** 3 + 3 + 4 por bloque (arriba y abajo) = 20 publicidades en flyers de zona. */
export const GROUP_FLYER_ADS_TOTAL = 20;
export const GROUP_FLYER_ADS_PER_BLOCK = 10;

export type GroupFlyerAdRows = {
  row1: AdvertisementDTO[];
  row2: AdvertisementDTO[];
  row3: AdvertisementDTO[];
};

function sliceToRows(ads: AdvertisementDTO[]): GroupFlyerAdRows {
  return {
    row1: ads.slice(0, 3),
    row2: ads.slice(3, 6),
    row3: ads.slice(6, 10),
  };
}

export function splitGroupFlyerAds(ads: AdvertisementDTO[]): {
  top: GroupFlyerAdRows;
  bottom: GroupFlyerAdRows;
} {
  return {
    top: sliceToRows(ads.slice(0, GROUP_FLYER_ADS_PER_BLOCK)),
    bottom: sliceToRows(
      ads.slice(GROUP_FLYER_ADS_PER_BLOCK, GROUP_FLYER_ADS_TOTAL)
    ),
  };
}

export function hasGroupFlyerAds(rows: GroupFlyerAdRows): boolean {
  return rows.row1.length + rows.row2.length + rows.row3.length > 0;
}
