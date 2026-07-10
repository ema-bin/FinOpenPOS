import type { AdvertisementDTO } from "@/models/dto/advertisement";

/** Elige hasta `count` publicidades al azar, sin repetir. */
export function pickRandomAdvertisements(
  ads: AdvertisementDTO[],
  count: number
): AdvertisementDTO[] {
  if (ads.length <= count) return [...ads];
  const shuffled = [...ads];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}
