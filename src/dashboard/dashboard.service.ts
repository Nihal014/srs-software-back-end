import { Inject, Injectable } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import { PO_STATUS } from '../purchase-orders/po.interface.js';

// Stock on hand in a batch — the one formula used everywhere (see migration 008).
const AVAILABLE = '(b.qty_received - b.qty_consumed + b.qty_adjusted)';
const LIST_LIMIT = 5;

const num = (v: unknown) => Number(v ?? 0);
const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class DashboardService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  private async rows(sql: string, params: unknown[] = []) {
    const [rows] = await this.pool.query<RowDataPacket[]>(sql, params);
    return rows;
  }

  async get(isAdmin: boolean) {
    const [pendingApproval, awaitingReceipt, lowStock, production, stock] = await Promise.all([
      this.pendingApproval(),
      this.awaitingReceipt(),
      this.lowStock(),
      this.production(),
      this.stock(isAdmin),
    ]);
    return { isAdmin, attention: { pendingApproval, awaitingReceipt, lowStock }, production, stock };
  }

  /** Lists are capped for the card; `count` is the true total. */
  private async pendingApproval() {
    const count = await this.rows('SELECT COUNT(*) AS n FROM purchase_orders WHERE status = ?', [PO_STATUS.PendingApproval]);
    const items = await this.rows(
      `SELECT po.id, po.po_number, s.name AS supplier_name
         FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.status = ? ORDER BY po.created_at DESC LIMIT ${LIST_LIMIT}`,
      [PO_STATUS.PendingApproval],
    );
    return { count: num(count[0].n), items };
  }

  /** POs sent to the supplier that still have goods to come. `overdue` = past their expected date. */
  private async awaitingReceipt() {
    const statuses = [PO_STATUS.SentToSupplier, PO_STATUS.PartiallyReceived];
    const count = await this.rows('SELECT COUNT(*) AS n FROM purchase_orders WHERE status IN (?)', [statuses]);
    const items = await this.rows(
      `SELECT po.id, po.po_number, s.name AS supplier_name,
              DATE_FORMAT(po.expected_date, '%Y-%m-%d') AS expected_date,
              (po.expected_date IS NOT NULL AND po.expected_date < CURDATE()) AS overdue
         FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.status IN (?)
        ORDER BY overdue DESC, po.expected_date IS NULL, po.expected_date, po.id
        LIMIT ${LIST_LIMIT}`,
      [statuses],
    );
    return { count: num(count[0].n), items: items.map((r) => ({ ...r, overdue: !!r.overdue })) };
  }

  /** Active items whose usable (unexpired) stock is at or below their reorder level. */
  private async lowStock() {
    const rows = await this.rows(
      `SELECT i.id, i.code, i.name, i.unit, i.reorder_level,
              COALESCE(SUM(CASE WHEN b.expiry_date >= CURDATE() AND b.is_quarantined = 0 THEN ${AVAILABLE} END), 0) AS qty
         FROM items i LEFT JOIN batches b ON b.item_id = i.id
        WHERE i.is_active = 1 AND i.reorder_level > 0
        GROUP BY i.id, i.code, i.name, i.unit, i.reorder_level
       HAVING qty <= i.reorder_level
        ORDER BY qty / i.reorder_level, i.name`,
    );
    return {
      count: rows.length,
      items: rows.slice(0, LIST_LIMIT).map((r) => ({ id: r.id, code: r.code, name: r.name, unit: r.unit, qty: num(r.qty), reorder_level: num(r.reorder_level) })),
    };
  }

  private async production() {
    const r = (
      await this.rows(
        `SELECT
           COALESCE(SUM(CASE WHEN produced_date = CURDATE() THEN qty_produced END), 0) AS today_units,
           SUM(produced_date = CURDATE()) AS today_runs,
           COALESCE(SUM(qty_produced), 0) AS week_units,
           COUNT(*) AS week_runs
         FROM bundle_productions WHERE produced_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)`,
      )
    )[0];
    return { todayUnits: num(r.today_units), todayRuns: num(r.today_runs), weekUnits: num(r.week_units), weekRuns: num(r.week_runs) };
  }

  /** Raw-material stock. Values (at item rates) are Admin only. */
  private async stock(isAdmin: boolean) {
    const r = (
      await this.rows(
        `SELECT
           COUNT(DISTINCT CASE WHEN b.expiry_date >= CURDATE() THEN b.item_id END) AS items_in_stock,
           COALESCE(SUM(CASE WHEN b.expiry_date >= CURDATE() THEN ${AVAILABLE} * i.rate END), 0) AS usable_value,
           COALESCE(SUM(CASE WHEN b.expiry_date < CURDATE() THEN ${AVAILABLE} * i.rate END), 0) AS expired_value
         FROM batches b JOIN items i ON i.id = b.item_id
        WHERE b.is_quarantined = 0 AND ${AVAILABLE} > 0`,
      )
    )[0];
    return {
      itemsInStock: num(r.items_in_stock),
      usableValue: isAdmin ? round2(num(r.usable_value)) : null,
      expiredValue: isAdmin ? round2(num(r.expired_value)) : null,
    };
  }
}
