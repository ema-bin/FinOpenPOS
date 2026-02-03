export interface AdvertisementDTO {
  id: number;
  name: string;
  image_url: string;
  target_url: string | null;
  description: string | null;
  is_active: boolean;
  ordering: number;
  created_at: string;
}
