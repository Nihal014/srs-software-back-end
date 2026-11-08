import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import type { Paged } from '../common/pagination.util.js';
import { PRODUCT_TRANSFER_STATUS } from './product-transfer.interface.js';
import type { CreateProductTransferDto, ReceiveProductTransferDto } from './dto/product-transfer.dto.js';

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const todayStr = () => new Date().toISOString().slice(0, 10);
const AVAILABLE = '(l.qty_received - l.qty_consumed + l.qty_adjusted)';

/** A child lot keeps its source's number plus a transfer-line suffix, kept within the 40-character column. */
function childLotNumber(sourceNumber: string, lineId: number) {
  const root = sourceNumber.replace(/-T\d+$/, '');
  const suffix = `-T${lineId}`;
  return `${root.slice(0, 40 - suffix.length)}${suffix}`;
}

@Injectable()
export class ProductTransfersService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async findAll(paging: { page: number; pageSize: number; offset: number }): Promise<Paged<any>> {
    const [countRows] = await this.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM product_transfers');
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT t.id, t.transfer_number, t.receipt_number, t.status,
              DATE_FORMAT(t.transfer_date, '%Y-%m-%d') AS transfer_date,
              DATE_FORMAT(t.received_date, '%Y-%m-%d') AS received_date,
              fl.name AS from_location_name, tl.name AS to_location_name,
              GROUP_CONCAT(DISTINCT bp.name ORDER BY bp.name SEPARATOR ', ') AS product_names
         FROM product_transfers t
         JOIN delivery_locations fl ON fl.id = t.from_location_id
         JOIN delivery_locations tl ON tl.id = t.to_location_id
         JOIN product_transfer_lines l ON l.product_transfer_id = t.id
         JOIN bundle_products bp ON bp.id = l.bundle_product_id
        GROUP BY t.id
        ORDER BY t.transfer_date DESC, t.id DESC
        LIMIT ? OFFSET ?`,
      [paging.pageSize, paging.offset],
    );
    return { rows, total: Number(countRows[0].total), page: paging.page, pageSize: paging.pageSize };
  }

  /** Finished pieces in hand, by product and location (the little stock table on the LTO & LTI page). */
  async stock() {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT bp.id AS bundle_product_id, bp.name AS product_name, bp.output_unit,
              dl.id AS location_id, dl.name AS location_name,
              SUM(${AVAILABLE}) AS qty_available
         FROM product_lots l
         JOIN bundle_products bp ON bp.id = l.bundle_product_id
         JOIN delivery_locations dl ON dl.id = l.location_id
        GROUP BY bp.id, dl.id
       HAVING qty_available > 0
        ORDER BY bp.name, dl.name`,
    );
    return rows;
  }

  async findOne(id: number) {
    const [headRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT t.id, t.transfer_number, t.receipt_number, t.status, t.remarks, t.receive_remarks,
              DATE_FORMAT(t.transfer_date, '%Y-%m-%d') AS transfer_date,
              DATE_FORMAT(t.received_date, '%Y-%m-%d') AS received_date,
              t.from_location_id, t.to_location_id, fl.name AS from_location_name, tl.name AS to_location_name,
              cu.name AS created_by_name, ru.name AS received_by_name
         FROM product_transfers t
         JOIN delivery_locations fl ON fl.id = t.from_location_id
         JOIN delivery_locations tl ON tl.id = t.to_location_id
         LEFT JOIN users cu ON cu.id = t.created_by
         LEFT JOIN users ru ON ru.id = t.received_by
        WHERE t.id = ?`,
      [id],
    );
    const head = headRows[0];
    if (!head) throw new NotFoundException(`Product transfer ${id} not found`);

    const [lines] = await this.pool.query<RowDataPacket[]>(
      `SELECT l.id, l.source_lot_id, l.bundle_product_id, l.qty_sent, l.qty_received, l.new_lot_id,
              bp.code AS product_code, bp.name AS product_name, bp.output_unit,
              sl.lot_number AS source_lot_number, nl.lot_number AS new_lot_number,
              sl.production_id, p.production_number
         FROM product_transfer_lines l
         JOIN bundle_products bp ON bp.id = l.bundle_product_id
         JOIN product_lots sl ON sl.id = l.source_lot_id
         JOIN bundle_productions p ON p.id = sl.production_id
         LEFT JOIN product_lots nl ON nl.id = l.new_lot_id
        WHERE l.product_transfer_id = ?
        ORDER BY l.id`,
      [id],
    );
    return { ...head, lines };
  }

  /** The "New transfer" screen: what can be sent from one location. */
  async newContext(fromLocationId: number) {
    const [locRows] = await this.pool.query<RowDataPacket[]>('SELECT id, name FROM delivery_locations WHERE id = ?', [fromLocationId]);
    const location = locRows[0];
    if (!location) throw new NotFoundException(`Location ${fromLocationId} not found`);

    const [lots] = await this.pool.query<RowDataPacket[]>(
      `SELECT l.id AS lot_id, l.lot_number, l.bundle_product_id, bp.code AS product_code, bp.name AS product_name,
              bp.output_unit, p.production_number, DATE_FORMAT(p.produced_date, '%Y-%m-%d') AS produced_date,
              ${AVAILABLE} AS qty_available
         FROM product_lots l
         JOIN bundle_products bp ON bp.id = l.bundle_product_id
         JOIN bundle_productions p ON p.id = l.production_id
        WHERE l.location_id = ? AND ${AVAILABLE} > 0
        ORDER BY bp.name, p.produced_date, l.id`,
      [fromLocationId],
    );
    return { location, lots };
  }

  /** LTO: take the pieces out of the sending location. They stay "in transit" until the receiver confirms (LTI). */
  async create(dto: CreateProductTransferDto, userId: number) {
    if (dto.fromLocationId === dto.toLocationId) throw new BadRequestException('Choose two different locations.');
    const lotIds = dto.lines.map((l) => l.lotId);
    if (new Set(lotIds).size !== lotIds.length) throw new BadRequestException('A lot can only appear once on a transfer.');

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

      const prepared: { lotId: number; productId: number; qty: number }[] = [];
      for (const line of dto.lines) {
        const [rows] = await conn.query<RowDataPacket[]>(
          `SELECT l.id, l.bundle_product_id, l.lot_number, l.location_id, bp.name AS product_name,
                  ${AVAILABLE} AS qty_available
             FROM product_lots l JOIN bundle_products bp ON bp.id = l.bundle_product_id
            WHERE l.id = ? FOR UPDATE`,
          [line.lotId],
        );
        const lot = rows[0];
        if (!lot) throw new NotFoundException(`Lot ${line.lotId} not found`);
        const label = `"${lot.product_name}" (${lot.lot_number})`;
        if (lot.location_id !== dto.fromLocationId) throw new BadRequestException(`${label} is not in ${from.name}.`);
        if (round3(line.qty) > round3(Number(lot.qty_available))) {
          throw new BadRequestException(`${label} only has ${lot.qty_available} in ${from.name} - can't send ${line.qty}.`);
        }
        prepared.push({ lotId: lot.id, productId: lot.bundle_product_id, qty: line.qty });
      }

      const [result] = await conn.query<any>(
        `INSERT INTO product_transfers (transfer_number, from_location_id, to_location_id, transfer_date, remarks, created_by)
         VALUES ('', ?, ?, ?, ?, ?)`,
        [dto.fromLocationId, dto.toLocationId, dto.transferDate ?? todayStr(), dto.remarks?.trim() || null, userId],
      );
      const transferId = result.insertId;
      const number = `PLTO-${new Date().getFullYear()}-${String(transferId).padStart(4, '0')}`;
      await conn.query('UPDATE product_transfers SET transfer_number = ? WHERE id = ?', [number, transferId]);

      for (const l of prepared) {
        await conn.query(
          'INSERT INTO product_transfer_lines (product_transfer_id, source_lot_id, bundle_product_id, qty_sent) VALUES (?, ?, ?, ?)',
          [transferId, l.lotId, l.productId, l.qty],
        );
        await conn.query('UPDATE product_lots SET qty_adjusted = qty_adjusted - ? WHERE id = ?', [l.qty, l.lotId]);
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
    const [rows] = await conn.query<RowDataPacket[]>('SELECT * FROM product_transfers WHERE id = ? FOR UPDATE', [id]);
    const transfer = rows[0];
    if (!transfer) throw new NotFoundException(`Product transfer ${id} not found`);
    if (transfer.status !== PRODUCT_TRANSFER_STATUS.InTransit) {
      throw new ConflictException(`${transfer.transfer_number} is no longer in transit.`);
    }
    return transfer;
  }

  /** LTI: the receiver confirms what actually arrived. That quantity becomes a lot at the receiving location. */
  async receive(id: number, dto: ReceiveProductTransferDto, userId: number) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const transfer = await this.lockInTransit(conn, id);

      const [lines] = await conn.query<RowDataPacket[]>('SELECT * FROM product_transfer_lines WHERE product_transfer_id = ? ORDER BY id', [id]);
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
        let newLotId: number | null = null;
        if (r.qtyReceived > 0) {
          const [srcRows] = await conn.query<RowDataPacket[]>(
            'SELECT lot_number, bundle_product_id, production_id FROM product_lots WHERE id = ?',
            [line.source_lot_id],
          );
          const src = srcRows[0];
          const [ins] = await conn.query<any>(
            `INSERT INTO product_lots (lot_number, bundle_product_id, location_id, production_id, source_lot_id, qty_received)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [childLotNumber(src.lot_number, line.id), src.bundle_product_id, transfer.to_location_id, src.production_id, line.source_lot_id, r.qtyReceived],
          );
          newLotId = ins.insertId;
        }
        await conn.query('UPDATE product_transfer_lines SET qty_received = ?, new_lot_id = ? WHERE id = ?', [r.qtyReceived, newLotId, line.id]);
      }

      const receiptNumber = `PLTI-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`;
      await conn.query(
        `UPDATE product_transfers SET status = ?, receipt_number = ?, received_date = ?, received_by = ?, receive_remarks = ? WHERE id = ?`,
        [PRODUCT_TRANSFER_STATUS.Received, receiptNumber, dto.receivedDate ?? todayStr(), userId, dto.remarks?.trim() || null, id],
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

  /** Undo an LTO that was never received: the pieces go back to the sending location. */
  async cancel(id: number) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      await this.lockInTransit(conn, id);

      const [lines] = await conn.query<RowDataPacket[]>('SELECT * FROM product_transfer_lines WHERE product_transfer_id = ?', [id]);
      for (const l of lines) {
        await conn.query('UPDATE product_lots SET qty_adjusted = qty_adjusted + ? WHERE id = ?', [l.qty_sent, l.source_lot_id]);
      }
      await conn.query('UPDATE product_transfers SET status = ? WHERE id = ?', [PRODUCT_TRANSFER_STATUS.Cancelled, id]);

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
