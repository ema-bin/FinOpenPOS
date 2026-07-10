import type { AdvertisementDTO } from "@/models/dto/advertisement";

/** 4 arriba + 4 arriba + 4 encima del resultado = 12 publicidades. */
export const MATCH_RESULT_ADS_PER_ROW = 4;
export const MATCH_RESULT_ADS_TOTAL = 12;

export type MatchResultAdRows = {
  row1: AdvertisementDTO[];
  row2: AdvertisementDTO[];
  row3: AdvertisementDTO[];
};

export function splitMatchResultAds(ads: AdvertisementDTO[]): MatchResultAdRows {
  return {
    row1: ads.slice(0, MATCH_RESULT_ADS_PER_ROW),
    row2: ads.slice(MATCH_RESULT_ADS_PER_ROW, MATCH_RESULT_ADS_PER_ROW * 2),
    row3: ads.slice(MATCH_RESULT_ADS_PER_ROW * 2, MATCH_RESULT_ADS_TOTAL),
  };
}

export function hasMatchResultAds(rows: MatchResultAdRows): boolean {
  return rows.row1.length + rows.row2.length + rows.row3.length > 0;
}
export type MatchResultAdRowDef = {
  ads: AdvertisementDTO[];
  variant: "top" | "bottom";
};

export function matchResultAdRowDefs(rows: MatchResultAdRows): MatchResultAdRowDef[] {
  return (
    [
      { ads: rows.row1, variant: "top" as const },
      { ads: rows.row2, variant: "top" as const },
      { ads: rows.row3, variant: "bottom" as const },
    ] as MatchResultAdRowDef[]
  ).filter((row) => row.ads.length > 0);
}
