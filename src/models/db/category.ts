// Database model for categories (libre / damas)

export type CategoryType = "libre" | "damas";

export interface Category {
  id: number;
  name: string;
  type: CategoryType;
  display_order: number;
  sum_value?: number | null; // para damas: valor para suma 13 (4ta=4, 5ta=5, 6ta=6, 7ma=7)
}
