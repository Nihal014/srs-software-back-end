import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import type { Paged } from '../common/pagination.util.js';
import { PRODUCT_LOT_ADJUSTMENT_REASON } from './product-inventory.interface.js';
import type { CreateProductAuditDto, CreateProductWastageDto } from './dto/product-inventory.dto.js';

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const todayStr = () => new Date().toISOString().slice(0, 10);
const AVAILABLE = '(l.qty_received - l.qty_consumed + l.qty_adjusted)';

interface LockedLot {
  id: number;
  avail: number;
  unit_cost: number;
}

@Injectable()
export class ProductInventoryService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  /** Finished pieces in hand by product and location, valued at what the runs cost per piece; plus what is on the road. */
  async status() {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT bp.id AS bundle_product_id, bp.name AS product_name, bp.output_unit,
              dl.id AS location_id, dl.name AS location_name,
              SUM(${AVAILABLE}) AS qty_available,
              SUM(${AVAILABLE} * p.unit_cost) / SUM(${AVAILABLE}) AS unit_cost,
              SUM(${AVAILABLE} * p.unit_cost) AS stock_value
         FROM product_lots l
         JOIN bundle_products bp ON bp.id = l.bundle_product_id
         JOIN delivery_locations dl ON dl.id = l.location_id
         JOIN bundle_productions p ON p.id = l.production_id
        GROUP BY bp.id, dl.id
       HAVING qty_available > 0
        ORDER BY bp.name, dl.name`,
    );
    const [inTransit] = await this.pool.query<RowDataPacket[]>(
      `SELECT t.id AS transfer_id, t.transfer_number, bp.name AS product_name, bp.output_unit,
              SUM(tl.qty_sent) AS qty, fl.name AS from_location_name, dl.name AS to_location_name
         FROM product_transfers t
         JOIN product_transfer_lines tl ON tl.product_transfer_id = t.id
         JOIN bundle_products bp ON bp.id = tl.bundle_product_id
         JOIN delivery_locations fl ON fl.id = t.from_location_id
         JOIN delivery_locations dl ON dl.id = t.to_location_id
        WHERE t.status = 1
        GROUP BY t.id, bp.id
        ORDER BY t.id DESC`,
    );
    return { rows, inTransit };
  }

  /** Every lot that still has pieces: which run made it, how old it is, what it cost. */
  async lots(paging: { page: number; pageSize: number; offset: number }, locationId?: number): Promise<Paged<any>> {
    const where = `WHERE ${AVAILABLE} > 0 ${locationId ? 'AND l.location_id = ?' : ''}`;
    const params = locationId ? [locationId] : [];
    const [countRows] = await this.pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM product_lots l ${where}`, params);
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT l.id AS lot_id, l.lot_number, bp.name AS product_name, bp.output_unit, dl.name AS location_name,
              p.production_number, DATE_FORMAT(p.produced_date, '%Y-%m-%d') AS produced_date,
              DATEDIFF(CURDATE(), p.produced_date) AS age_days,
              l.qty_received, ${AVAILABLE} AS qty_available, p.unit_cost,
              ${AVAILABLE} * p.unit_cost AS stock_value
         FROM product_lots l
         JOIN bundle_products bp ON bp.id = l.bundle_product_id
         JOIN delivery_locations dl ON dl.id = l.location_id
         JOIN bundle_productions p ON p.id = l.production_id
        ${where}
        ORDER BY p.produced_date, l.id
        LIMIT ? OFFSET ?`,
      [...params, paging.pageSize, paging.offset],
    );
    return { rows, total: Number(countRows[0].total), page: paging.page, pageSize: paging.pageSize };
  }

  /** The lots of a product at a location with pieces left, oldest first, locked for the rest of the transaction. */
  private async lockLots(conn: PoolConnection, locationId: number, productId: number): Promise<LockedLot[]> {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT l.id, ${AVAILABLE} AS avail, p.unit_cost
         FROM product_lots l
         JOIN bundle_productions p ON p.id = l.production_id
        WHERE l.location_id = ? AND l.bundle_product_id = ? AND ${AVAILABLE} > 0
        ORDER BY p.produced_date, l.id
          FOR UPDATE`,
      [locationId, productId],
    );
    return rows.map((r) => ({ id: r.id, avail: Number(r.avail), unit_cost: Number(r.unit_cost) }));
  }

  private weightedCost(lots: LockedLot[]) {
    const total = lots.reduce((a, l) => a + l.avail, 0);
    return total > 0 ? round2(lots.reduce((a, l) => a + l.avail * l.unit_cost, 0) / total) : 0;
  }

  /** Take `qty` pieces out of the lots, oldest first. Returns what the pieces cost on average. */
  private async removeFromLots(
    conn: PoolConnection,
    lots: LockedLot[],
    qty: number,
    reason: number,
    ref: { wastageId?: number; auditId?: number },
    userId: number,
  ) {
    let remaining = qty;
    let cost = 0;
    for (const lot of lots) {
      if (remaining <= 0) break;
      const take = round3(Math.min(lot.avail, remaining));
      await conn.query('UPDATE product_lots SET qty_adjusted = qty_adjusted - ? WHERE id = ?', [take, lot.id]);
      await conn.query(
        'INSERT INTO product_lot_adjustments (lot_id, qty, reason, wastage_id, audit_id, created_by) VALUES (?, ?, ?, ?, ?, ?)',
        [lot.id, -take, reason, ref.wastageId ?? null, ref.auditId ?? null, userId],
      );
      cost += take * lot.unit_cost;
      remaining = round3(remaining - take);
    }
    return qty > 0 ? round2(cost / qty) : 0;
  }

  async audits(paging: { page: number; pageSize: number; offset: number }, onlyId?: number): Promise<Paged<any>> {
    const where = onlyId ? 'WHERE a.id = ?' : '';
    const [countRows] = await this.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM product_stock_audits a ' + where, onlyId ? [onlyId] : []);
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT a.id, a.audit_number, a.remarks, DATE_FORMAT(a.audit_date, '%Y-%m-%d') AS audit_date,
              dl.name AS location_name, u.name AS created_by_name
         FROM product_stock_audits a
         JOIN delivery_locations dl ON dl.id = a.location_id
         LEFT JOIN users u ON u.id = a.created_by
         ${where}
        ORDER BY a.audit_date DESC, a.id DESC
        LIMIT ? OFFSET ?`,
      [...(onlyId ? [onlyId] : []), paging.pageSize, paging.offset],
    );
    const ids = rows.map((r) => r.id);
    const lines = ids.length
      ? (
          await this.pool.query<RowDataPacket[]>(
            `SELECT al.audit_id, bp.name AS product_name, bp.output_unit, al.system_qty, al.counted_qty, al.difference,
                    al.difference * al.unit_cost AS difference_value
               FROM product_stock_audit_lines al JOIN bundle_products bp ON bp.id = al.bundle_product_id
              WHERE al.audit_id IN (?) ORDER BY al.id`,
            [ids],
          )
        )[0]
      : [];
    return {
      rows: rows.map((r) => ({ ...r, lines: lines.filter((l) => l.audit_id === r.id) })),
      total: Number(countRows[0].total),
      page: paging.page,
      pageSize: paging.pageSize,
    };
  }

  /**
   * A physical count: for each product counted at a location the system works out what it expected,
   * and the difference is applied to the lots (a shortfall comes off the oldest lots, a surplus is
   * added to the newest) with a ledger row for each, so the correction can always be explained.
   */
  async createAudit(dto: CreateProductAuditDto, userId: number) {
    const productIds = dto.lines.map((l) => l.bundleProductId);
    if (new Set(productIds).size !== productIds.length) throw new BadRequestException('A product can only be counted once per audit.');

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [locRows] = await conn.query<RowDataPacket[]>('SELECT id, name FROM delivery_locations WHERE id = ?', [dto.locationId]);
      const location = locRows[0];
      if (!location) throw new NotFoundException('Location not found.');

      const [result] = await conn.query<any>(
        'INSERT INTO product_stock_audits (audit_number, location_id, audit_date, remarks, created_by) VALUES (\'\', ?, ?, ?, ?)',
        [dto.locationId, dto.auditDate ?? todayStr(), dto.remarks?.trim() || null, userId],
      );
      const auditId = result.insertId;
      await conn.query('UPDATE product_stock_audits SET audit_number = ? WHERE id = ?', [
        `SA-${new Date().getFullYear()}-${String(auditId).padStart(4, '0')}`,
        auditId,
      ]);

      for (const line of dto.lines) {
        const [prodRows] = await conn.query<RowDataPacket[]>('SELECT id, name FROM bundle_products WHERE id = ?', [line.bundleProductId]);
        if (!prodRows[0]) throw new NotFoundException(`Product ${line.bundleProductId} not found`);
        const lots = await this.lockLots(conn, dto.locationId, line.bundleProductId);
        const system = round3(lots.reduce((a, l) => a + l.avail, 0));
        if (!lots.length) {
          throw new BadRequestException(`"${prodRows[0].name}" has no stock in ${location.name} to count.`);
        }
        const difference = round3(line.countedQty - system);
        const unitCost = this.weightedCost(lots);

        if (difference < 0) {
          await this.removeFromLots(conn, lots, -difference, PRODUCT_LOT_ADJUSTMENT_REASON.StockAudit, { auditId }, userId);
        } else if (difference > 0) {
          const newest = lots[lots.length - 1];
          await conn.query('UPDATE product_lots SET qty_adjusted = qty_adjusted + ? WHERE id = ?', [difference, newest.id]);
          await conn.query(
            'INSERT INTO product_lot_adjustments (lot_id, qty, reason, audit_id, created_by) VALUES (?, ?, ?, ?, ?)',
            [newest.id, difference, PRODUCT_LOT_ADJUSTMENT_REASON.StockAudit, auditId, userId],
          );
        }
        await conn.query(
          `INSERT INTO product_stock_audit_lines (audit_id, bundle_product_id, system_qty, counted_qty, difference, unit_cost)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [auditId, line.bundleProductId, system, line.countedQty, difference, unitCost],
        );
      }

      await conn.commit();
      return (await this.audits({ page: 1, pageSize: 1, offset: 0 }, auditId)).rows[0];
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async wastage(paging: { page: number; pageSize: number; offset: number }, onlyId?: number): Promise<Paged<any>> {
    const where = onlyId ? 'WHERE w.id = ?' : '';
    const [countRows] = await this.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM product_wastage w ' + where, onlyId ? [onlyId] : []);
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT w.id, w.wastage_number, w.reason, w.qty, w.unit_cost, w.qty * w.unit_cost AS value, w.remarks,
              DATE_FORMAT(w.wastage_date, '%Y-%m-%d') AS wastage_date,
              bp.name AS product_name, bp.output_unit, dl.name AS location_name, u.name AS created_by_name
         FROM product_wastage w
         JOIN bundle_products bp ON bp.id = w.bundle_product_id
         JOIN delivery_locations dl ON dl.id = w.location_id
         LEFT JOIN users u ON u.id = w.created_by
         ${where}
        ORDER BY w.wastage_date DESC, w.id DESC
        LIMIT ? OFFSET ?`,
      [...(onlyId ? [onlyId] : []), paging.pageSize, paging.offset],
    );
    return { rows, total: Number(countRows[0].total), page: paging.page, pageSize: paging.pageSize };
  }

  /** Throw pieces away: they leave the oldest lots first and are valued at what those lots cost. */
  async createWastage(dto: CreateProductWastageDto, userId: number) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [locRows] = await conn.query<RowDataPacket[]>('SELECT id, name FROM delivery_locations WHERE id = ?', [dto.locationId]);
      const [prodRows] = await conn.query<RowDataPacket[]>('SELECT id, name FROM bundle_products WHERE id = ?', [dto.bundleProductId]);
      if (!locRows[0]) throw new NotFoundException('Location not found.');
      if (!prodRows[0]) throw new NotFoundException('Product not found.');

      const lots = await this.lockLots(conn, dto.locationId, dto.bundleProductId);
      const available = round3(lots.reduce((a, l) => a + l.avail, 0));
      if (round3(dto.qty) > available) {
        throw new BadRequestException(`"${prodRows[0].name}" only has ${available} in ${locRows[0].name} - can't write off ${dto.qty}.`);
      }

      const [result] = await conn.query<any>(
        `INSERT INTO product_wastage (wastage_number, wastage_date, location_id, bundle_product_id, qty, reason, remarks, unit_cost, created_by)
         VALUES ('', ?, ?, ?, ?, ?, ?, 0, ?)`,
        [dto.wastageDate ?? todayStr(), dto.locationId, dto.bundleProductId, dto.qty, dto.reason, dto.remarks?.trim() || null, userId],
      );
      const wastageId = result.insertId;
      const unitCost = await this.removeFromLots(conn, lots, dto.qty, PRODUCT_LOT_ADJUSTMENT_REASON.Wastage, { wastageId }, userId);
      await conn.query('UPDATE product_wastage SET wastage_number = ?, unit_cost = ? WHERE id = ?', [
        `WST-${new Date().getFullYear()}-${String(wastageId).padStart(4, '0')}`,
        unitCost,
        wastageId,
      ]);

      await conn.commit();
      return (await this.wastage({ page: 1, pageSize: 1, offset: 0 }, wastageId)).rows[0];
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}
