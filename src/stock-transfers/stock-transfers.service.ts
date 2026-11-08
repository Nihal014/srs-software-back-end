import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import type { Paged } from '../common/pagination.util.js';
import { BATCH_ADJUSTMENT_REASON } from '../batches/batch.interface.js';
import { STOCK_TRANSFER_STATUS } from './stock-transfer.interface.js';
import type { CreateStockTransferDto, ReceiveStockTransferDto } from './dto/stock-transfer.dto.js';

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const todayStr = () => new Date().toISOString().slice(0, 10);

/** A child batch keeps its source's number plus a transfer-line suffix, kept within the 40-character column. */
function childBatchNumber(sourceNumber: string, lineId: number) {
  const root = sourceNumber.replace(/-T\d+$/, '');
  const suffix = `-T${lineId}`;
  return `${root.slice(0, 40 - suffix.length)}${suffix}`;
}

@Injectable()
export class StockTransfersService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async findAll(paging: { page: number; pageSize: number; offset: number }): Promise<Paged<any>> {
    const [countRows] = await this.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM stock_transfers');
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT t.id, t.transfer_number, t.receipt_number, t.status,
              DATE_FORMAT(t.transfer_date, '%Y-%m-%d') AS transfer_date,
              DATE_FORMAT(t.received_date, '%Y-%m-%d') AS received_date,
              fl.name AS from_location_name, tl.name AS to_location_name,
              GROUP_CONCAT(DISTINCT i.name ORDER BY i.name SEPARATOR ', ') AS item_names
         FROM stock_transfers t
         JOIN delivery_locations fl ON fl.id = t.from_location_id
         JOIN delivery_locations tl ON tl.id = t.to_location_id
         JOIN stock_transfer_lines l ON l.stock_transfer_id = t.id
         JOIN items i ON i.id = l.item_id
        GROUP BY t.id
        ORDER BY t.transfer_date DESC, t.id DESC
        LIMIT ? OFFSET ?`,
      [paging.pageSize, paging.offset],
    );
    return { rows, total: Number(countRows[0].total), page: paging.page, pageSize: paging.pageSize };
  }

  async findOne(id: number) {
    const [headRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT t.id, t.transfer_number, t.receipt_number, t.status, t.remarks, t.receive_remarks,
              DATE_FORMAT(t.transfer_date, '%Y-%m-%d') AS transfer_date,
              DATE_FORMAT(t.received_date, '%Y-%m-%d') AS received_date,
              t.from_location_id, t.to_location_id, fl.name AS from_location_name, tl.name AS to_location_name,
              cu.name AS created_by_name, ru.name AS received_by_name
         FROM stock_transfers t
         JOIN delivery_locations fl ON fl.id = t.from_location_id
         JOIN delivery_locations tl ON tl.id = t.to_location_id
         LEFT JOIN users cu ON cu.id = t.created_by
         LEFT JOIN users ru ON ru.id = t.received_by
        WHERE t.id = ?`,
      [id],
    );
    const head = headRows[0];
    if (!head) throw new NotFoundException(`Stock transfer ${id} not found`);

    const [lines] = await this.pool.query<RowDataPacket[]>(
      `SELECT l.id, l.source_batch_id, l.item_id, l.qty_sent, l.qty_received, l.new_batch_id,
              i.code AS item_code, i.name AS item_name, i.unit, ic.name AS category_name,
              b.batch_number AS source_batch_number, nb.batch_number AS new_batch_number,
              DATE_FORMAT(b.expiry_date, '%Y-%m-%d') AS expiry_date
         FROM stock_transfer_lines l
         JOIN items i ON i.id = l.item_id
         LEFT JOIN item_categories ic ON ic.id = i.category_id
         JOIN batches b ON b.id = l.source_batch_id
         LEFT JOIN batches nb ON nb.id = l.new_batch_id
        WHERE l.stock_transfer_id = ?
        ORDER BY l.id`,
      [id],
    );
    return { ...head, lines };
  }

  /** The "New transfer" screen: what can be sent from one location (usable, unexpired stock only). */
  async newContext(fromLocationId: number) {
    const [locRows] = await this.pool.query<RowDataPacket[]>('SELECT id, name FROM delivery_locations WHERE id = ?', [fromLocationId]);
    const location = locRows[0];
    if (!location) throw new NotFoundException(`Location ${fromLocationId} not found`);

    const [batches] = await this.pool.query<RowDataPacket[]>(
      `SELECT b.id AS batch_id, b.batch_number, b.item_id, i.code AS item_code, i.name AS item_name, i.unit,
              ic.name AS category_name, DATE_FORMAT(b.expiry_date, '%Y-%m-%d') AS expiry_date,
              (b.qty_received - b.qty_consumed + b.qty_adjusted) AS qty_available
         FROM batches b
         JOIN items i ON i.id = b.item_id
         LEFT JOIN item_categories ic ON ic.id = i.category_id
        WHERE b.location_id = ? AND b.is_quarantined = 0 AND b.expiry_date >= CURDATE()
          AND (b.qty_received - b.qty_consumed + b.qty_adjusted) > 0
        ORDER BY i.name, b.expiry_date`,
      [fromLocationId],
    );
    return { location, batches };
  }

  /** LTO: take the stock out of the sending location. It stays "in transit" until the receiver confirms (LTI). */
  async create(dto: CreateStockTransferDto, userId: number) {
    if (dto.fromLocationId === dto.toLocationId) throw new BadRequestException('Choose two different locations.');
    const batchIds = dto.lines.map((l) => l.batchId);
    if (new Set(batchIds).size !== batchIds.length) throw new BadRequestException('A batch can only appear once on a transfer.');

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const [locs] = await conn.query<RowDataPacket[]>('SELECT id, name, is_active FROM delivery_locations WHERE id IN (?, ?)', [
        dto.fromLocationId,
        dto.toLocationId,
      ]);
      const from = locs.find((l) => l.id === dto.fromLocationId);
      const to = locs.find((l) => l.id === dto.toLocationId);
      if (!from || !to) throw new NotFoundException('Location not found.');
      if (!to.is_active) throw new BadRequestException(`"${to.name}" is inactive.`);

      const prepared: { batchId: number; itemId: number; qty: number; label: string }[] = [];
      for (const line of dto.lines) {
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT b.id, b.item_id, b.batch_number, b.location_id, b.is_quarantined, (b.expiry_date < CURDATE()) AS expired,
                  i.name AS item_name, (b.qty_received - b.qty_consumed + b.qty_adjusted) AS qty_available
             FROM batches b JOIN items i ON i.id = b.item_id
            WHERE b.id = ? FOR UPDATE`,
          [line.batchId],
        );
        const batch = rows[0];
        if (!batch) throw new NotFoundException(`Batch ${line.batchId} not found`);
        const label = `"${batch.item_name}" (${batch.batch_number})`;
        if (batch.location_id !== dto.fromLocationId) throw new BadRequestException(`${label} is not in ${from.name}.`);
        if (batch.is_quarantined) throw new BadRequestException(`${label} is quarantined and can't be moved.`);
        if (batch.expired) throw new BadRequestException(`${label} has expired - write it off instead of moving it.`);
        if (round3(line.qty) > round3(Number(batch.qty_available))) {
          throw new BadRequestException(`${label} only has ${batch.qty_available} in ${from.name} - can't send ${line.qty}.`);
        }
        prepared.push({ batchId: batch.id, itemId: batch.item_id, qty: line.qty, label });
      }

      const [result] = await conn.query<any>(
        `INSERT INTO stock_transfers (transfer_number, from_location_id, to_location_id, transfer_date, remarks, created_by)
         VALUES ('', ?, ?, ?, ?, ?)`,
        [dto.fromLocationId, dto.toLocationId, dto.transferDate ?? todayStr(), dto.remarks?.trim() || null, userId],
      );
      const transferId = result.insertId;
      const number = `LTO-${new Date().getFullYear()}-${String(transferId).padStart(4, '0')}`;
      await conn.query('UPDATE stock_transfers SET transfer_number = ? WHERE id = ?', [number, transferId]);

      for (const l of prepared) {
        await conn.query(
          'INSERT INTO stock_transfer_lines (stock_transfer_id, source_batch_id, item_id, qty_sent) VALUES (?, ?, ?, ?)',
          [transferId, l.batchId, l.itemId, l.qty],
        );
        await conn.query('UPDATE batches SET qty_adjusted = qty_adjusted - ? WHERE id = ?', [l.qty, l.batchId]);
        await conn.query(
          'INSERT INTO batch_adjustments (batch_id, qty, reason, remarks, created_by) VALUES (?, ?, ?, ?, ?)',
          [l.batchId, -l.qty, BATCH_ADJUSTMENT_REASON.TransferredOut, `Sent to ${to.name} (${number})`, userId],
        );
      }

      await conn.commit();
      return this.findOne(transferId);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  private async lockInTransit(conn: PoolConnection, id: number) {
    const [rows] = await conn.query<RowDataPacket[]>('SELECT * FROM stock_transfers WHERE id = ? FOR UPDATE', [id]);
    const transfer = rows[0];
    if (!transfer) throw new NotFoundException(`Stock transfer ${id} not found`);
    if (transfer.status !== STOCK_TRANSFER_STATUS.InTransit) {
      throw new ConflictException(`${transfer.transfer_number} is no longer in transit.`);
    }
    return transfer;
  }

  /** LTI: the receiver confirms what actually arrived. That quantity becomes a batch at the receiving location. */
  async receive(id: number, dto: ReceiveStockTransferDto, userId: number) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const transfer = await this.lockInTransit(conn, id);

      const [lines] = await conn.query<RowDataPacket[]>('SELECT * FROM stock_transfer_lines WHERE stock_transfer_id = ? ORDER BY id', [id]);
      const sentById = new Map(lines.map((l) => [l.id as number, l]));
      const receivedIds = dto.lines.map((l) => l.lineId);
      if (new Set(receivedIds).size !== receivedIds.length || receivedIds.length !== lines.length || receivedIds.some((x) => !sentById.has(x))) {
        throw new BadRequestException('Enter the received quantity for every line of this transfer.');
      }

      for (const r of dto.lines) {
        const line = sentById.get(r.lineId)!;
        if (round3(r.qtyReceived) > round3(Number(line.qty_sent))) {
          throw new BadRequestException(`Received ${r.qtyReceived} is more than the ${line.qty_sent} that was sent.`);
        }
        let newBatchId: number | null = null;
        if (r.qtyReceived > 0) {
          const [srcRows] = await conn.query<RowDataPacket[]>(
            'SELECT batch_number, item_id, grn_line_id, mfg_date, expiry_date FROM batches WHERE id = ?',
            [line.source_batch_id],
          );
          const src = srcRows[0];
          const [ins] = await conn.query<any>(
            `INSERT INTO batches (batch_number, item_id, location_id, grn_line_id, source_batch_id, qty_received, mfg_date, expiry_date)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [childBatchNumber(src.batch_number, line.id), src.item_id, transfer.to_location_id, src.grn_line_id, line.source_batch_id, r.qtyReceived, src.mfg_date, src.expiry_date],
          );
          newBatchId = ins.insertId;
        }
        await conn.query('UPDATE stock_transfer_lines SET qty_received = ?, new_batch_id = ? WHERE id = ?', [r.qtyReceived, newBatchId, line.id]);
      }

      const receiptNumber = `LTI-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`;
      await conn.query(
        `UPDATE stock_transfers SET status = ?, receipt_number = ?, received_date = ?, received_by = ?, receive_remarks = ? WHERE id = ?`,
        [STOCK_TRANSFER_STATUS.Received, receiptNumber, dto.receivedDate ?? todayStr(), userId, dto.remarks?.trim() || null, id],
      );

      await conn.commit();
      return this.findOne(id);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** Undo an LTO that was never received: the stock goes back to the sending location. */
  async cancel(id: number, userId: number) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const transfer = await this.lockInTransit(conn, id);

      const [lines] = await conn.query<RowDataPacket[]>('SELECT * FROM stock_transfer_lines WHERE stock_transfer_id = ?', [id]);
      for (const l of lines) {
        await conn.query('UPDATE batches SET qty_adjusted = qty_adjusted + ? WHERE id = ?', [l.qty_sent, l.source_batch_id]);
        await conn.query(
          'INSERT INTO batch_adjustments (batch_id, qty, reason, remarks, created_by) VALUES (?, ?, ?, ?, ?)',
          [l.source_batch_id, l.qty_sent, BATCH_ADJUSTMENT_REASON.TransferCancelled, `Transfer cancelled (${transfer.transfer_number})`, userId],
        );
      }
      await conn.query('UPDATE stock_transfers SET status = ? WHERE id = ?', [STOCK_TRANSFER_STATUS.Cancelled, id]);

      await conn.commit();
      return this.findOne(id);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}
