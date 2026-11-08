import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import type { Paged } from '../common/pagination.util.js';
import { BATCH_ADJUSTMENT_REASON } from '../batches/batch.interface.js';
import { PURCHASE_RETURN_CREDIT } from './purchase-return.interface.js';
import type { CreatePurchaseReturnDto } from './dto/create-purchase-return.dto.js';

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;
const todayStr = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class PurchaseReturnsService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async findAll(paging: { page: number; pageSize: number; offset: number }): Promise<Paged<any>>;
  async findAll(): Promise<any[]>;
  async findAll(paging?: { page: number; pageSize: number; offset: number }) {
    let total: number | null = null;
    if (paging) {
      const [countRows] = await this.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM purchase_returns');
      total = Number(countRows[0].total);
    }
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT pr.id, pr.return_number, DATE_FORMAT(pr.return_date, '%Y-%m-%d') AS return_date, pr.total_amount,
              pr.credit_status, g.id AS grn_id, g.grn_number, s.name AS supplier_name,
              GROUP_CONCAT(DISTINCT i.name ORDER BY i.name SEPARATOR ', ') AS item_names
         FROM purchase_returns pr
         JOIN grns g ON g.id = pr.grn_id
         JOIN suppliers s ON s.id = pr.supplier_id
         JOIN purchase_return_lines prl ON prl.purchase_return_id = pr.id
         JOIN items i ON i.id = prl.item_id
        GROUP BY pr.id
        ORDER BY pr.return_date DESC, pr.id DESC
        ${paging ? 'LIMIT ? OFFSET ?' : ''}`,
      paging ? [paging.pageSize, paging.offset] : [],
    );
    return paging ? { rows, total: total!, page: paging.page, pageSize: paging.pageSize } : rows;
  }

  async findOne(id: number) {
    const [headRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT pr.id, pr.return_number, DATE_FORMAT(pr.return_date, '%Y-%m-%d') AS return_date, pr.total_amount,
              pr.credit_status, DATE_FORMAT(pr.credit_received_date, '%Y-%m-%d') AS credit_received_date,
              pr.remarks, pr.created_at, g.id AS grn_id, g.grn_number, po.id AS purchase_order_id, po.po_number,
              s.name AS supplier_name, u.name AS created_by_name
         FROM purchase_returns pr
         JOIN grns g ON g.id = pr.grn_id
         JOIN purchase_orders po ON po.id = g.purchase_order_id
         JOIN suppliers s ON s.id = pr.supplier_id
         LEFT JOIN users u ON u.id = pr.created_by
        WHERE pr.id = ?`,
      [id],
    );
    const head = headRows[0];
    if (!head) throw new NotFoundException(`Purchase return ${id} not found`);

    const [lines] = await this.pool.query<RowDataPacket[]>(
      `SELECT prl.id, prl.batch_id, prl.item_id, prl.qty, prl.rate, prl.amount, prl.reason, prl.remarks,
              i.code AS item_code, i.name AS item_name, i.unit, ic.name AS category_name,
              b.batch_number, DATE_FORMAT(b.expiry_date, '%Y-%m-%d') AS expiry_date
         FROM purchase_return_lines prl
         JOIN items i ON i.id = prl.item_id
         LEFT JOIN item_categories ic ON ic.id = i.category_id
         JOIN batches b ON b.id = prl.batch_id
        WHERE prl.purchase_return_id = ?
        ORDER BY prl.id`,
      [id],
    );
    return { ...head, lines };
  }

  /** The "New purchase return" screen: one GRN's batches that still have stock, with the rate each was bought at. */
  async newContext(grnId: number) {
    const [grnRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT g.id, g.grn_number, DATE_FORMAT(g.received_date, '%Y-%m-%d') AS received_date,
              po.po_number, s.id AS supplier_id, s.name AS supplier_name
         FROM grns g
         JOIN purchase_orders po ON po.id = g.purchase_order_id
         JOIN suppliers s ON s.id = po.supplier_id
        WHERE g.id = ?`,
      [grnId],
    );
    const grn = grnRows[0];
    if (!grn) throw new NotFoundException(`GRN ${grnId} not found`);

    const [batches] = await this.pool.query<RowDataPacket[]>(
      `SELECT b.id AS batch_id, b.batch_number, b.item_id, i.code AS item_code, i.name AS item_name, i.unit,
              ic.name AS category_name, DATE_FORMAT(b.expiry_date, '%Y-%m-%d') AS expiry_date,
              b.qty_received, (b.qty_received - b.qty_consumed + b.qty_adjusted) AS qty_available, pol.rate
         FROM batches b
         JOIN grn_lines gl ON gl.id = b.grn_line_id
         JOIN purchase_order_lines pol ON pol.id = gl.purchase_order_line_id
         JOIN items i ON i.id = b.item_id
         LEFT JOIN item_categories ic ON ic.id = i.category_id
        WHERE gl.grn_id = ? AND (b.qty_received - b.qty_consumed + b.qty_adjusted) > 0
        ORDER BY gl.id`,
      [grnId],
    );
    return { grn, batches };
  }

  async create(dto: CreatePurchaseReturnDto, userId: number) {
    const batchIds = dto.lines.map((l) => l.batchId);
    if (new Set(batchIds).size !== batchIds.length) {
      throw new BadRequestException('A batch can only appear once on a return.');
    }

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const [grnRows] = await conn.query<RowDataPacket[]>(
        `SELECT g.id, po.supplier_id
           FROM grns g JOIN purchase_orders po ON po.id = g.purchase_order_id
          WHERE g.id = ?`,
        [dto.grnId],
      );
      const grn = grnRows[0];
      if (!grn) throw new NotFoundException(`GRN ${dto.grnId} not found`);

      const prepared: { batchId: number; itemId: number; qty: number; rate: number; amount: number; reason: number; remarks: string | null }[] = [];
      for (const line of dto.lines) {
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT b.id, b.item_id, b.batch_number, gl.grn_id, pol.rate, i.name AS item_name,
                  (b.qty_received - b.qty_consumed + b.qty_adjusted) AS qty_available
             FROM batches b
             JOIN grn_lines gl ON gl.id = b.grn_line_id
             JOIN purchase_order_lines pol ON pol.id = gl.purchase_order_line_id
             JOIN items i ON i.id = b.item_id
            WHERE b.id = ? FOR UPDATE`,
          [line.batchId],
        );
        const batch = rows[0];
        if (!batch) throw new NotFoundException(`Batch ${line.batchId} not found`);
        if (batch.grn_id !== dto.grnId) {
          throw new BadRequestException(`Batch ${batch.batch_number} does not belong to this GRN.`);
        }
        if (round3(line.qty) > round3(Number(batch.qty_available))) {
          throw new BadRequestException(
            `"${batch.item_name}" (${batch.batch_number}) only has ${batch.qty_available} in stock - can't return ${line.qty}.`,
          );
        }
        const rate = Number(batch.rate);
        prepared.push({
          batchId: batch.id,
          itemId: batch.item_id,
          qty: line.qty,
          rate,
          amount: round2(line.qty * rate),
          reason: line.reason,
          remarks: line.remarks?.trim() || null,
        });
      }

      const total = round2(prepared.reduce((a, l) => a + l.amount, 0));
      const [result] = await conn.query<any>(
        `INSERT INTO purchase_returns (return_number, grn_id, supplier_id, return_date, total_amount, remarks, created_by)
         VALUES ('', ?, ?, ?, ?, ?, ?)`,
        [dto.grnId, grn.supplier_id, dto.returnDate ?? todayStr(), total, dto.remarks?.trim() || null, userId],
      );
      const returnId = result.insertId;
      const returnNumber = `PRN-${new Date().getFullYear()}-${String(returnId).padStart(4, '0')}`;
      await conn.query('UPDATE purchase_returns SET return_number = ? WHERE id = ?', [returnNumber, returnId]);

      for (const l of prepared) {
        await conn.query(
          `INSERT INTO purchase_return_lines (purchase_return_id, batch_id, item_id, qty, rate, amount, reason, remarks)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [returnId, l.batchId, l.itemId, l.qty, l.rate, l.amount, l.reason, l.remarks],
        );
        await conn.query('UPDATE batches SET qty_adjusted = qty_adjusted - ? WHERE id = ?', [l.qty, l.batchId]);
        await conn.query(
          `INSERT INTO batch_adjustments (batch_id, qty, reason, remarks, created_by) VALUES (?, ?, ?, ?, ?)`,
          [l.batchId, -l.qty, BATCH_ADJUSTMENT_REASON.ReturnedToSupplier, `Returned to supplier (${returnNumber})`, userId],
        );
      }

      await conn.commit();
      return this.findOne(returnId);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** The supplier has refunded the returned goods or set them against a later bill. */
  async markCreditReceived(id: number) {
    const [result] = await this.pool.query<any>(
      `UPDATE purchase_returns SET credit_status = ?, credit_received_date = CURDATE()
        WHERE id = ? AND credit_status = ?`,
      [PURCHASE_RETURN_CREDIT.Received, id, PURCHASE_RETURN_CREDIT.Pending],
    );
    if (result.affectedRows === 0) {
      const [rows] = await this.pool.query<RowDataPacket[]>('SELECT id FROM purchase_returns WHERE id = ?', [id]);
      if (!rows[0]) throw new NotFoundException(`Purchase return ${id} not found`);
      throw new ConflictException('The credit for this return is already marked as received.');
    }
    return this.findOne(id);
  }
}
