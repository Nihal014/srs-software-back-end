import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import { ItemsService } from '../items/items.service.js';
import type { CreatePoDto } from './dto/create-po.dto.js';
import type { UpdatePoDto } from './dto/update-po.dto.js';
import type { PoLineDto } from './dto/po-line.dto.js';
import { PO_STATUS, PO_STATUS_LABEL } from './po.interface.js';
import type { PoStatus } from './po.interface.js';

export const APPROVAL_THRESHOLD = 50000;

function lineTotal(l: { qtyOrdered: number; rate: number; tax_percent: number; discount: number }) {
  const gross = l.qtyOrdered * l.rate - l.discount;
  return gross + (gross * l.tax_percent) / 100;
}

@Injectable()
export class PurchaseOrdersService {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly items: ItemsService,
  ) {}

  private async assertLinesValid(lines: PoLineDto[]) {
    if (!lines.length) {
      throw new BadRequestException('A purchase order needs at least one line.');
    }
    const items = await this.items.findAll();
    const validIds = new Set(items.map((i) => i.id));
    for (const l of lines) {
      if (!validIds.has(l.itemId)) {
        throw new BadRequestException(`Item ${l.itemId} is not a valid item.`);
      }
    }
  }

  async findAll(status?: PoStatus) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT po.id, po.po_number, po.status, po.expected_date, po.created_at,
              s.id AS supplier_id, s.name AS supplier_name,
              COALESCE(lt.qty_ordered, 0) AS qty_ordered,
              COALESCE(lt.value, 0) AS value,
              COALESCE(rc.qty_received, 0) AS qty_received
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
         LEFT JOIN (
           SELECT purchase_order_id,
                  SUM(qty_ordered) AS qty_ordered,
                  SUM(qty_ordered * rate - discount + (qty_ordered * rate - discount) * tax_percent / 100) AS value
             FROM purchase_order_lines
            GROUP BY purchase_order_id
         ) lt ON lt.purchase_order_id = po.id
         LEFT JOIN (
           SELECT pol.purchase_order_id, SUM(gl.qty_received) AS qty_received
             FROM grn_lines gl
             JOIN purchase_order_lines pol ON pol.id = gl.purchase_order_line_id
            GROUP BY pol.purchase_order_id
         ) rc ON rc.purchase_order_id = po.id
        WHERE (? IS NULL OR po.status = ?)
        ORDER BY po.created_at DESC`,
      [status ?? null, status ?? null],
    );
    return rows.map((r) => ({
      ...r,
      qtyOutstanding: Math.max(0, Number(r.qty_ordered) - Number(r.qty_received)),
    }));
  }

  async findOne(id: number): Promise<any> {
    const [poRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT po.*, s.name AS supplier_name
         FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id
        WHERE po.id = ?`,
      [id],
    );
    const po = poRows[0];
    if (!po) throw new NotFoundException(`Purchase order ${id} not found`);

    const [lines] = await this.pool.query<RowDataPacket[]>(
      `SELECT pol.*, i.code AS item_code, i.name AS item_name, i.unit,
              COALESCE(rc.qty_received, 0) AS qty_received
         FROM purchase_order_lines pol
         JOIN items i ON i.id = pol.item_id
         LEFT JOIN (
           SELECT purchase_order_line_id, SUM(qty_received) AS qty_received
             FROM grn_lines GROUP BY purchase_order_line_id
         ) rc ON rc.purchase_order_line_id = pol.id
        WHERE pol.purchase_order_id = ?
        ORDER BY pol.id`,
      [id],
    );

    const [grns] = await this.pool.query<RowDataPacket[]>(
      `SELECT g.id, g.grn_number, g.received_date,
              SUM(gl.qty_received) AS qty_received,
              SUM(gl.qty_accepted) AS qty_accepted,
              SUM(gl.qty_rejected) AS qty_rejected,
              GROUP_CONCAT(gl.batch_number SEPARATOR ', ') AS batch_numbers
         FROM grns g
         JOIN grn_lines gl ON gl.grn_id = g.id
        WHERE g.purchase_order_id = ?
        GROUP BY g.id
        ORDER BY g.received_date DESC, g.id DESC`,
      [id],
    );

    const linesWithTotals = lines.map((l) => ({
      ...l,
      outstanding: Math.max(0, Number(l.qty_ordered) - Number(l.qty_received)),
      lineTotal: lineTotal({
        qtyOrdered: Number(l.qty_ordered),
        rate: Number(l.rate),
        tax_percent: Number(l.tax_percent),
        discount: Number(l.discount),
      }),
    }));
    const subtotal = lines.reduce((a, l) => a + Number(l.qty_ordered) * Number(l.rate), 0);
    const discount = lines.reduce((a, l) => a + Number(l.discount), 0);
    const tax = lines.reduce((a, l, i) => {
      const gross = Number(l.qty_ordered) * Number(l.rate) - Number(l.discount);
      return a + (linesWithTotals[i].lineTotal - gross);
    }, 0);
    const grandTotal = linesWithTotals.reduce((a, l) => a + l.lineTotal, 0);

    return {
      ...po,
      lines: linesWithTotals,
      totals: { subtotal, discount, tax, grandTotal },
      grns,
    };
  }

  async create(dto: CreatePoDto) {
    await this.assertLinesValid(dto.lines);
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query<any>(
        `INSERT INTO purchase_orders
           (po_number, supplier_id, status, delivery_location, expected_date, payment_terms, remarks)
         VALUES ('', ?, ?, ?, ?, ?, ?)`,
        [
          dto.supplierId,
          PO_STATUS.Draft,
          dto.deliveryLocation ?? 'Kollam Production Unit',
          dto.expectedDate ?? null,
          dto.paymentTerms ?? 'Net 15 days',
          dto.remarks ?? null,
        ],
      );
      const id = result.insertId;
      const poNumber = `PO-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`;
      await conn.query('UPDATE purchase_orders SET po_number = ? WHERE id = ?', [poNumber, id]);
      await this.insertLines(conn, id, dto.lines);
      await conn.commit();
      return this.findOne(id);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  private async insertLines(conn: PoolConnection, poId: number, lines: PoLineDto[]) {
    for (const l of lines) {
      await conn.query(
        `INSERT INTO purchase_order_lines
           (purchase_order_id, item_id, qty_ordered, rate, tax_percent, discount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [poId, l.itemId, l.qtyOrdered, l.rate, l.taxPercent, l.discount],
      );
    }
  }

  async update(id: number, dto: UpdatePoDto) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT status FROM purchase_orders WHERE id = ?',
      [id],
    );
    if (!rows[0]) throw new NotFoundException(`Purchase order ${id} not found`);
    if (rows[0].status !== PO_STATUS.Draft) {
      throw new BadRequestException('Only a Draft purchase order can be edited.');
    }
    if (dto.lines) await this.assertLinesValid(dto.lines);

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const fields: string[] = [];
      const values: unknown[] = [];
      if (dto.deliveryLocation !== undefined) { fields.push('delivery_location = ?'); values.push(dto.deliveryLocation); }
      if (dto.expectedDate !== undefined) { fields.push('expected_date = ?'); values.push(dto.expectedDate); }
      if (dto.paymentTerms !== undefined) { fields.push('payment_terms = ?'); values.push(dto.paymentTerms); }
      if (dto.remarks !== undefined) { fields.push('remarks = ?'); values.push(dto.remarks); }
      if (fields.length) {
        values.push(id);
        await conn.query(`UPDATE purchase_orders SET ${fields.join(', ')} WHERE id = ?`, values);
      }
      if (dto.lines) {
        await conn.query('DELETE FROM purchase_order_lines WHERE purchase_order_id = ?', [id]);
        await this.insertLines(conn, id, dto.lines);
      }
      await conn.commit();
      return this.findOne(id);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** Atomic status flip: only succeeds if the PO is currently in `from`. */
  private async transition(id: number, from: PoStatus, to: PoStatus) {
    const [result] = await this.pool.query<any>(
      'UPDATE purchase_orders SET status = ? WHERE id = ? AND status = ?',
      [to, id, from],
    );
    if (result.affectedRows === 0) {
      const [rows] = await this.pool.query<RowDataPacket[]>(
        'SELECT status FROM purchase_orders WHERE id = ?',
        [id],
      );
      if (!rows[0]) throw new NotFoundException(`Purchase order ${id} not found`);
      throw new ConflictException(
        `Cannot move ${PO_STATUS_LABEL[rows[0].status as PoStatus]} → ${PO_STATUS_LABEL[to]}; expected the PO to be ${PO_STATUS_LABEL[from]}.`,
      );
    }
  }

  async sendForApproval(id: number) {
    await this.transition(id, PO_STATUS.Draft, PO_STATUS.PendingApproval);
    return this.findOne(id);
  }

  async approve(id: number, acknowledgeThreshold: boolean) {
    const po = await this.findOne(id);
    if (po.status !== PO_STATUS.PendingApproval) {
      throw new ConflictException(`Cannot approve a PO in status ${PO_STATUS_LABEL[po.status as PoStatus]}.`);
    }
    if (po.totals.grandTotal > APPROVAL_THRESHOLD && !acknowledgeThreshold) {
      throw new BadRequestException(
        `${po.po_number} is Rs ${po.totals.grandTotal.toFixed(2)}, over the Rs ${APPROVAL_THRESHOLD.toLocaleString('en-IN')} threshold — confirm second approval to proceed.`,
      );
    }
    await this.transition(id, PO_STATUS.PendingApproval, PO_STATUS.Approved);
    return this.findOne(id);
  }

  async sendToSupplier(id: number) {
    await this.transition(id, PO_STATUS.Approved, PO_STATUS.SentToSupplier);
    return this.findOne(id);
  }

  async close(id: number) {
    await this.transition(id, PO_STATUS.FullyReceived, PO_STATUS.Closed);
    return this.findOne(id);
  }

  /** Called by GrnService right after posting a GRN, inside the same transaction. */
  async recomputeReceivedStatus(conn: PoolConnection, poId: number) {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT
          COALESCE(SUM(pol.qty_ordered), 0) AS ordered,
          COALESCE((SELECT SUM(gl.qty_received) FROM grn_lines gl
                      JOIN purchase_order_lines p2 ON p2.id = gl.purchase_order_line_id
                     WHERE p2.purchase_order_id = ?), 0) AS received
         FROM purchase_order_lines pol
        WHERE pol.purchase_order_id = ?`,
      [poId, poId],
    );
    const { ordered, received } = rows[0];
    const [poRows] = await conn.query<RowDataPacket[]>(
      'SELECT status FROM purchase_orders WHERE id = ? FOR UPDATE',
      [poId],
    );
    const status = poRows[0].status as PoStatus;
    const receivableStatuses: PoStatus[] = [PO_STATUS.SentToSupplier, PO_STATUS.PartiallyReceived, PO_STATUS.FullyReceived];
    if (!receivableStatuses.includes(status)) return;
    const nextStatus: PoStatus =
      received <= 0 ? PO_STATUS.SentToSupplier : received < ordered ? PO_STATUS.PartiallyReceived : PO_STATUS.FullyReceived;
    if (nextStatus !== status) {
      await conn.query('UPDATE purchase_orders SET status = ? WHERE id = ?', [nextStatus, poId]);
    }
  }
}
