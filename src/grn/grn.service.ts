import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import { ItemsService } from '../items/items.service.js';
import { PurchaseOrdersService } from '../purchase-orders/purchase-orders.service.js';
import { PO_STATUS, PO_STATUS_LABEL, type PoStatus } from '../purchase-orders/po.interface.js';
import type { Paged } from '../common/pagination.util.js';
import { mnemonicFor, shelfLifeDaysFor } from './batch-code.js';
import type { CreateGrnDto } from './dto/create-grn.dto.js';

const RECEIVABLE_STATUSES: number[] = [PO_STATUS.SentToSupplier, PO_STATUS.PartiallyReceived];

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class GrnService {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly items: ItemsService,
    private readonly purchaseOrders: PurchaseOrdersService,
  ) {}

  /** With `paging` omitted, returns the plain array as before; with `paging` set, returns
   * `{rows, total, page, pageSize}` for the paginated GRN list screen. */
  async findAll(): Promise<any[]>;
  async findAll(paging: { page: number; pageSize: number; offset: number }): Promise<Paged<any>>;
  async findAll(paging?: { page: number; pageSize: number; offset: number }) {
    let total: number | null = null;
    if (paging) {
      const [countRows] = await this.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM grns');
      total = Number(countRows[0].total);
    }
    const limitClause = paging ? 'LIMIT ? OFFSET ?' : '';
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT g.id, g.grn_number, g.received_date, po.po_number, po.id AS purchase_order_id,
              s.name AS supplier_name,
              SUM(gl.qty_received) AS qty_received,
              SUM(gl.qty_accepted) AS qty_accepted,
              SUM(gl.qty_rejected) AS qty_rejected,
              GROUP_CONCAT(DISTINCT gl.batch_number SEPARATOR ', ') AS batch_numbers
         FROM grns g
         JOIN purchase_orders po ON po.id = g.purchase_order_id
         JOIN suppliers s ON s.id = po.supplier_id
         JOIN grn_lines gl ON gl.grn_id = g.id
        GROUP BY g.id
        ORDER BY g.received_date DESC, g.id DESC
        ${limitClause}`,
      paging ? [paging.pageSize, paging.offset] : [],
    );
    return paging ? { rows, total: total!, page: paging.page, pageSize: paging.pageSize } : rows;
  }

  async findOne(id: number) {
    const [grnRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT g.*, po.po_number, s.name AS supplier_name
         FROM grns g
         JOIN purchase_orders po ON po.id = g.purchase_order_id
         JOIN suppliers s ON s.id = po.supplier_id
        WHERE g.id = ?`,
      [id],
    );
    const grn = grnRows[0];
    if (!grn) throw new NotFoundException(`GRN ${id} not found`);

    const [lines] = await this.pool.query<RowDataPacket[]>(
      `SELECT gl.*, i.name AS item_name, i.unit,
              b.id AS batch_id
         FROM grn_lines gl
         JOIN items i ON i.id = gl.item_id
         LEFT JOIN batches b ON b.grn_line_id = gl.id
        WHERE gl.grn_id = ?
        ORDER BY gl.id`,
      [id],
    );
    return { ...grn, lines };
  }

  /** Context for the "New GRN" screen: PO header + each line's outstanding qty and suggested defaults. */
  async newContext(poId: number) {
    const [poRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT po.*, s.name AS supplier_name FROM purchase_orders po
         JOIN suppliers s ON s.id = po.supplier_id WHERE po.id = ?`,
      [poId],
    );
    const po = poRows[0];
    if (!po) throw new NotFoundException(`Purchase order ${poId} not found`);
    if (!RECEIVABLE_STATUSES.includes(po.status)) {
      throw new BadRequestException(
        `Cannot raise a GRN against a PO in status ${PO_STATUS_LABEL[po.status as PoStatus]}; it must be Sent to Supplier or Partially Received.`,
      );
    }

    const [lines] = await this.pool.query<RowDataPacket[]>(
      `SELECT pol.id AS purchase_order_line_id, pol.item_id, i.code AS item_code, i.name AS item_name,
              i.unit, pol.qty_ordered, pol.rate,
              COALESCE(rc.qty_received, 0) AS prior_received
         FROM purchase_order_lines pol
         JOIN items i ON i.id = pol.item_id
         LEFT JOIN (
           SELECT purchase_order_line_id, SUM(qty_received) AS qty_received
             FROM grn_lines GROUP BY purchase_order_line_id
         ) rc ON rc.purchase_order_line_id = pol.id
        WHERE pol.purchase_order_id = ?
        ORDER BY pol.id`,
      [poId],
    );

    const today = toDateStr(new Date());
    return {
      po,
      lines: lines.map((l) => {
        const outstanding = Math.max(0, Number(l.qty_ordered) - Number(l.prior_received));
        const shelfDays = shelfLifeDaysFor(l.item_code);
        const exp = new Date();
        exp.setDate(exp.getDate() + shelfDays);
        return {
          ...l,
          outstanding,
          suggested: {
            qtyReceived: outstanding,
            qtyAccepted: outstanding,
            qtyRejected: 0,
            mfgDate: today,
            expiryDate: toDateStr(exp),
          },
        };
      }),
    };
  }

  async create(dto: CreateGrnDto) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const [poRows] = await conn.query<RowDataPacket[]>(
        'SELECT * FROM purchase_orders WHERE id = ? FOR UPDATE',
        [dto.poId],
      );
      const po = poRows[0];
      if (!po) throw new NotFoundException(`Purchase order ${dto.poId} not found`);
      if (!RECEIVABLE_STATUSES.includes(po.status)) {
        throw new ConflictException(
          `Cannot raise a GRN against a PO in status ${PO_STATUS_LABEL[po.status as PoStatus]}.`,
        );
      }

      const [poLineRows] = await conn.query<RowDataPacket[]>(
        `SELECT pol.id, pol.item_id, pol.qty_ordered, pol.rate, i.code AS item_code,
                COALESCE(rc.qty_received, 0) AS prior_received
           FROM purchase_order_lines pol
           JOIN items i ON i.id = pol.item_id
           LEFT JOIN (
             SELECT purchase_order_line_id, SUM(qty_received) AS qty_received
               FROM grn_lines GROUP BY purchase_order_line_id
           ) rc ON rc.purchase_order_line_id = pol.id
          WHERE pol.purchase_order_id = ?`,
        [dto.poId],
      );
      const poLineById = new Map(poLineRows.map((r) => [r.id, r]));

      const linesToPost = dto.lines.filter((l) => l.qtyReceived > 0);
      if (!linesToPost.length) {
        throw new BadRequestException('Enter a received quantity on at least one line.');
      }

      for (const l of linesToPost) {
        const pol = poLineById.get(l.purchaseOrderLineId);
        if (!pol) {
          throw new BadRequestException(
            `Line ${l.purchaseOrderLineId} does not belong to ${po.po_number}.`,
          );
        }
        const outstanding = Math.max(0, Number(pol.qty_ordered) - Number(pol.prior_received));
        if (l.qtyReceived > outstanding) {
          throw new BadRequestException(
            `${pol.item_code}: received ${l.qtyReceived} exceeds outstanding ${outstanding} on ${po.po_number}.`,
          );
        }
        if (l.qtyAccepted + l.qtyRejected !== l.qtyReceived) {
          throw new BadRequestException(
            `${pol.item_code}: accepted + rejected (${l.qtyAccepted + l.qtyRejected}) must equal received (${l.qtyReceived}).`,
          );
        }
        if (l.qtyRejected > 0 && !l.rejectionReason?.trim()) {
          throw new BadRequestException(`${pol.item_code}: a rejection reason is required.`);
        }
      }

      const [result] = await conn.query<any>(
        `INSERT INTO grns (grn_number, purchase_order_id, received_date, remarks)
         VALUES ('', ?, ?, ?)`,
        [dto.poId, dto.receivedDate ?? toDateStr(new Date()), dto.remarks ?? null],
      );
      const grnId = result.insertId;
      const grnNumber = `GRN-${new Date().getFullYear()}-${String(grnId).padStart(4, '0')}`;
      await conn.query('UPDATE grns SET grn_number = ? WHERE id = ?', [grnNumber, grnId]);

      for (const l of linesToPost) {
        const pol = poLineById.get(l.purchaseOrderLineId)!;
        const [glResult] = await conn.query<any>(
          `INSERT INTO grn_lines
             (grn_id, purchase_order_line_id, item_id, qty_received, qty_accepted, qty_rejected,
              rejection_reason, batch_number, mfg_date, expiry_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            grnId, pol.id, pol.item_id, l.qtyReceived, l.qtyAccepted, l.qtyRejected,
            l.qtyRejected > 0 ? l.rejectionReason!.trim() : null,
            '', l.mfgDate, l.expiryDate,
          ],
        );
        const grnLineId = glResult.insertId;
        const batchNumber =
          l.batchNumber?.trim() ||
          `BN-${mnemonicFor(pol.item_code)}-${l.mfgDate.replace(/-/g, '')}-${grnLineId}`;
        await conn.query('UPDATE grn_lines SET batch_number = ? WHERE id = ?', [batchNumber, grnLineId]);

        if (l.qtyAccepted > 0) {
          await conn.query(
            `INSERT INTO batches (batch_number, item_id, grn_line_id, qty_received, mfg_date, expiry_date)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [batchNumber, pol.item_id, grnLineId, l.qtyAccepted, l.mfgDate, l.expiryDate],
          );

          const [priorRows] = await conn.query<RowDataPacket[]>(
            'SELECT COALESCE(SUM(qty_accepted), 0) AS prior FROM grn_lines WHERE item_id = ? AND id <> ?',
            [pol.item_id, grnLineId],
          );
          await this.items.applyWeightedAverageReceipt(
            conn,
            pol.item_id,
            Number(priorRows[0].prior),
            l.qtyAccepted,
            Number(pol.rate),
          );
        }
      }

      await this.purchaseOrders.recomputeReceivedStatus(conn, dto.poId);

      await conn.commit();
      return this.findOne(grnId);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}
