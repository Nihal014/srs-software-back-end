import { Inject, Injectable } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';

@Injectable()
export class BatchesService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async findAll() {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT b.*, i.name AS item_name, i.unit,
              gl.grn_id, g.grn_number, g.purchase_order_id, po.po_number,
              (b.qty_received - b.qty_consumed + b.qty_adjusted) AS qty_available,
              DATEDIFF(b.expiry_date, CURDATE()) AS days_to_expiry
         FROM batches b
         JOIN items i ON i.id = b.item_id
         JOIN grn_lines gl ON gl.id = b.grn_line_id
         JOIN grns g ON g.id = gl.grn_id
         JOIN purchase_orders po ON po.id = g.purchase_order_id
        ORDER BY b.expiry_date ASC`,
    );
    return rows;
  }
}
