import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import type { Paged } from '../common/pagination.util.js';
import type { AdjustBatchDto } from './dto/adjust-batch.dto.js';

const BATCH_SELECT = `
  SELECT b.*, i.name AS item_name, i.unit, i.rate AS item_rate,
         gl.grn_id, g.grn_number, g.purchase_order_id, po.po_number,
         (b.qty_received - b.qty_consumed + b.qty_adjusted) AS qty_available,
         DATEDIFF(b.expiry_date, CURDATE()) AS days_to_expiry
    FROM batches b
    JOIN items i ON i.id = b.item_id
    JOIN grn_lines gl ON gl.id = b.grn_line_id
    JOIN grns g ON g.id = gl.grn_id
    JOIN purchase_orders po ON po.id = g.purchase_order_id
`;

@Injectable()
export class BatchesService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  /** With `paging` omitted, returns the plain array as before — Stock Summary needs every batch
   * to aggregate usable/expired quantity per item, so it always calls this unpaginated. With
   * `paging` set, returns `{rows, total, page, pageSize}` for the paginated Batches & Expiry tab. */
  async findAll(): Promise<any[]>;
  async findAll(paging: { page: number; pageSize: number; offset: number }): Promise<Paged<any>>;
  async findAll(paging?: { page: number; pageSize: number; offset: number }) {
    let total: number | null = null;
    if (paging) {
      const [countRows] = await this.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM batches');
      total = Number(countRows[0].total);
    }
    const limitClause = paging ? 'LIMIT ? OFFSET ?' : '';
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `${BATCH_SELECT} ORDER BY b.expiry_date ASC ${limitClause}`,
      paging ? [paging.pageSize, paging.offset] : [],
    );
    return paging ? { rows, total: total!, page: paging.page, pageSize: paging.pageSize } : rows;
  }

  async adjustmentsFor(batchId: number) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT ba.*, u.name AS created_by_name
         FROM batch_adjustments ba
         LEFT JOIN users u ON u.id = ba.created_by
        WHERE ba.batch_id = ?
        ORDER BY ba.created_at DESC`,
      [batchId],
    );
    return rows;
  }

  /**
   * Manual stock correction (expiry write-off, damage, a stock-count fix, or anything else) —
   * never a delete or an in-place overwrite, so the batch's own numbers always explain
   * themselves from `qty_received`, `qty_consumed` and the sum of its adjustments. `dto.qty` is
   * signed: negative removes stock, positive adds it back (e.g. an earlier write-off undone).
   */
  async adjust(batchId: number, dto: AdjustBatchDto, userId: number) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT b.*, i.name AS item_name,
                (b.qty_received - b.qty_consumed + b.qty_adjusted) AS qty_available
           FROM batches b JOIN items i ON i.id = b.item_id WHERE b.id = ? FOR UPDATE`,
        [batchId],
      );
      const batch = rows[0];
      if (!batch) throw new NotFoundException(`Batch ${batchId} not found`);

      const newAvailable = Math.round((Number(batch.qty_available) + dto.qty) * 1000) / 1000;
      if (newAvailable < 0) {
        throw new BadRequestException(
          `"${batch.item_name}" (${batch.batch_number}) only has ${batch.qty_available} available — can't remove ${Math.abs(dto.qty)}.`,
        );
      }

      await conn.query('UPDATE batches SET qty_adjusted = qty_adjusted + ? WHERE id = ?', [dto.qty, batchId]);
      await conn.query(
        `INSERT INTO batch_adjustments (batch_id, qty, reason, remarks, created_by) VALUES (?, ?, ?, ?, ?)`,
        [batchId, dto.qty, dto.reason, dto.remarks?.trim() || null, userId],
      );

      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    const [updated] = await this.pool.query<RowDataPacket[]>(`${BATCH_SELECT} WHERE b.id = ?`, [batchId]);
    return updated[0];
  }
}
