export interface BundleProduct {
  id: number;
  code: string;
  name: string;
  output_unit: string;
  selling_price: number;
  is_active: boolean;
}

export interface BundleBomLine {
  id: number;
  bundle_product_id: number;
  item_id: number;
  item_code: string;
  item_name: string;
  unit: string;
  qty_per_unit: number;
}

export interface BundleProductDetail extends BundleProduct {
  bomLines: BundleBomLine[];
}

export interface BundleProduction {
  id: number;
  production_number: string;
  bundle_product_id: number;
  qty_produced: number;
  produced_date: string;
  material_cost: number;
  labor_cost_per_unit: number;
  overhead_cost_per_unit: number;
  unit_cost: number;
  selling_price: number;
  shortage_override: boolean;
  created_by: number | null;
  created_at: string;
}

export interface BundleConsumption {
  id: number;
  production_id: number;
  batch_id: number;
  item_id: number;
  item_name: string;
  batch_number: string;
  qty_consumed: number;
  rate_at_time: number;
  cost: number;
  grn_id: number;
  grn_number: string;
  purchase_order_id: number;
  po_number: string;
  supplier_name: string;
}

export interface RequirementLine {
  itemId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  required: number;
  available: number;
  shortage: number;
}
