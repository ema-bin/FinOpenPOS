// Database model for categories (libre / damas)

export type CategoryType = "libre" | "damas";

export interface Category {
  id: number;
  name: string;
  type: CategoryType;
  display_order: number;
  sum_value?: number | null; // para damas: valor para suma 13 (4ta=4 … 7ma=7); 8va sin sum_value
}
