import { BadRequestException } from '@nestjs/common';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

// Numeric code convention, mirrored by hand in the frontend (sales-docs.model.ts).
export const QUOTATION_STATUS = { Open: 1, Accepted: 2, Rejected: 3, Converted: 4 } as const;
export type QuotationStatus = (typeof QUOTATION_STATUS)[keyof typeof QUOTATION_STATUS];

export const ORDER_STATUS = { Open: 1, PartiallyDelivered: 2, Delivered: 3, Cancelled: 4 } as const;
export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const SALES_RETURN_REASON = { Damaged: 1, WrongItem: 2, QualityComplaint: 3, Unsold: 4, Other: 5 } as const;
export type SalesReturnReason = (typeof SALES_RETURN_REASON)[keyof typeof SALES_RETURN_REASON];

export const round2 = (n: number) => Math.round(n * 100) / 100;
export const round3 = (n: number) => Math.round(n * 1000) / 1000;
export const todayStr = () => new Date().toISOString().slice(0, 10);

export function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A document number built from its row id, e.g. SO-2026-0007. */
export const docNumber = (prefix: string, id: number) => `${prefix}-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`;

export interface DocLine {
  productId: number;
  qty: number;
  rate: number;
  taxPercent: number;
  discount: number;
}

/** (qty x rate - discount) plus tax, the same rule the purchase orders use. */
export function lineAmount(l: Pick<DocLine, 'qty' | 'rate' | 'taxPercent' | 'discount'>) {
  const gross = l.qty * l.rate - l.discount;
  return round2(gross + (gross * l.taxPercent) / 100);
}

/** SQL for a line's amount, for document totals computed in the database. */
export const lineAmountSql = (qty: string, rate: string, tax: string, discount: string) =>
  `ROUND((${qty} * ${rate} - ${discount}) * (1 + ${tax} / 100), 2)`;

type Queryable = Pick<Pool | PoolConnection, 'query'>;

/** Every product on a document must exist and be active; the discount can't exceed the line's gross. */
export async function assertLines(db: Queryable, lines: DocLine[]) {
  if (!lines.length) throw new BadRequestException('Add at least one line.');
  const ids = [...new Set(lines.map((l) => l.productId))];
  const [rows] = await db.query<RowDataPacket[]>('SELECT id, name, is_active FROM bundle_products WHERE id IN (?)', [ids]);
  for (const line of lines) {
    const product = rows.find((r) => r.id === line.productId);
    if (!product) throw new BadRequestException(`Product ${line.productId} not found.`);
    if (!product.is_active) throw new BadRequestException(`"${product.name}" is inactive.`);
    if (line.discount > line.qty * line.rate) {
      throw new BadRequestException(`"${product.name}": the discount is more than the line value.`);
    }
  }
}

export async function assertCustomer(db: Queryable, customerId: number, mustBeActive = true) {
  const [rows] = await db.query<RowDataPacket[]>('SELECT id, name, is_active, payment_terms FROM customers WHERE id = ?', [customerId]);
  const customer = rows[0];
  if (!customer) throw new BadRequestException('Unknown customer.');
  if (mustBeActive && !customer.is_active) throw new BadRequestException(`"${customer.name}" is inactive.`);
  return customer;
}

export async function assertLocation(db: Queryable, locationId: number | null | undefined) {
  if (!locationId) return null;
  const [rows] = await db.query<RowDataPacket[]>('SELECT id, is_active FROM sales_locations WHERE id = ?', [locationId]);
  if (!rows[0]) throw new BadRequestException('Unknown sales location.');
  return locationId;
}
