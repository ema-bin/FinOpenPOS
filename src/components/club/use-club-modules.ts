"use client";

import { useQuery } from "@tanstack/react-query";

export type ClubBrand = {
  name: string;
  short_name: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  on_primary_color: string;
  module_reservations: boolean;
  module_classes: boolean;
  module_tournaments: boolean;
  module_packs: boolean;
  module_buffet: boolean;
};

export function useClubBrand() {
  return useQuery({
    queryKey: ["club-brand"],
    queryFn: async () => {
      const response = await fetch("/api/club");
      if (!response.ok) return null;
      return response.json() as Promise<ClubBrand>;
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function moduleOn(brand: ClubBrand | null | undefined, key: keyof ClubBrand): boolean {
  if (!brand) return true;
  return brand[key] !== false;
}
