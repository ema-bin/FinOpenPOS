import type { AdvertisementDTO } from "@/models/dto/advertisement";
import { pickRandomAdvertisements } from "@/lib/pick-random-advertisements";

/** 4 arriba + 4 abajo = 8 publicidades en flyers de zona. */
export const GROUP_FLYER_ADS_PER_ROW = 4;
export const GROUP_FLYER_ADS_TOTAL = 8;

export type GroupFlyerAdsSplit = {
  top: AdvertisementDTO[];
  bottom: AdvertisementDTO[];
};

export function splitGroupFlyerAds(ads: AdvertisementDTO[]): GroupFlyerAdsSplit {
  return {
    top: ads.slice(0, GROUP_FLYER_ADS_PER_ROW),
    bottom: ads.slice(GROUP_FLYER_ADS_PER_ROW, GROUP_FLYER_ADS_TOTAL),
  };
}

export function pickGroupFlyerAds(ads: AdvertisementDTO[]): GroupFlyerAdsSplit {
  return splitGroupFlyerAds(pickRandomAdvertisements(ads, GROUP_FLYER_ADS_TOTAL));
}

export function hasGroupFlyerAds(split: GroupFlyerAdsSplit): boolean {
  return split.top.length + split.bottom.length > 0;
}
