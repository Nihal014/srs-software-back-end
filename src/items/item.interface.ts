export interface Item {
  id: number;
  code: string;
  name: string;
  unit: string;
  /** Optional; items created before categories existed stay null. */
  category_id: number | null;
  category_name: string | null;
  category_code: string | null;
  rate: number;
  reorder_level: number;
  is_active: boolean;
}

export interface ItemCategory {
  id: number;
  name: string;
  code: string | null;
  is_active: boolean;
  /** How many items use this category (delete is blocked while it is above 0). */
  item_count?: number;
}
