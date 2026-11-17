export type SignagePromotion = {
  id: number;
  name: string;
  title: string;
  description: string;
  imageUrl: string;
  price: number | null;
  highlight: string;
  startsOn: string | null;
  endsOn: string | null;
  isActive: boolean;
  contentType: "full_image" | "promo_card";
  updatedAt?: string;
};

export type SignagePlaylistItem = {
  id: number;
  promotionId: number;
  position: number;
  durationSeconds: number;
  promotion: SignagePromotion | null;
};

export type SignagePlaylist = {
  id: number;
  name: string;
  description: string;
  isActive: boolean;
  transition: "fade" | "cut";
  items: SignagePlaylistItem[];
};

export type SignageScreen = {
  id: number;
  name: string;
  slug: string;
  location: string;
  isActive: boolean;
  defaultPlaylistId: number | null;
  playbackToken: string;
  playbackUrl: string;
  lastSeenAt: string | null;
  today: string;
  now: { source: "override" | "schedule" | "default" | "fallback"; playlistId: number | null; playlistName: string | null };
};

export type SignageSchedule = {
  id: number;
  screenId: number;
  playlistId: number;
  name: string;
  weekdays: number[];
  startTime: string;
  endTime: string;
  startsOn: string | null;
  endsOn: string | null;
  priority: number;
  isActive: boolean;
};

export type SignageConflict = { leftId: number; rightId: number; leftName: string; rightName: string };

export type PlaybackSlide = {
  id: number;
  durationSeconds: number;
  contentType: "full_image" | "promo_card";
  title: string;
  description: string;
  imageUrl: string;
  price: number | null;
  highlight: string;
};
