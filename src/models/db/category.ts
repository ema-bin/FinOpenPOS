// Database model for categories (libre / damas)

export type CategoryType = "libre" | "damas";

export interface Category {
  id: number;
  name: string;
  type: CategoryType;
  display_order: number;
}
