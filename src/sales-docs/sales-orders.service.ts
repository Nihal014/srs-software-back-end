import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import type { Paged } from '../common/pagination.util.js';
import {
  ORDER_STATUS,
  assertCustomer,
  assertLines,
  assertLocation,
  docNumber,
  lineAmountSql,
  todayStr,
  type DocLine,
} from './sales-docs.interface.js';
import type { CreateSalesOrderDto } from './dto/sales-docs.dto.js';

const TOTAL = `(SELECT COALESCE(SUM(${lineAmountSql('l.qty_ordered', 'l.rate', 'l.tax_percent', 'l.discount')}), 0)
                  FROM sales_order_lines l WHERE l.sales_order_id = o.id)`;
const DELIVERED = `(SELECT COALESCE(SUM(dl.qty_delivered), 0) FROM delivery_note_lines dl
                      JOIN sales_order_lines l ON l.id = dl.sales_order_line_id WHERE l.sales_order_id = o.id)`;

export interface NewOrder {
  customerId: number;
  salesLocationId: number | null;
  quotationId: number | null;
  orderDate: string;
  expectedDate: string | null;
  remarks: string | null;
  lines: DocLine[];
}

@Injectable()
export class SalesOrdersService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async findAll(paging: { page: number; pageSize: number; offset: number }, status?: number): Promise<Paged<any>> {
    const where = status ? 'WHERE o.status = ?' : '';
    const params = status ? [status] : [];
    const [countRows] = await this.pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM sales_orders o ${where}`, params);
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT o.id, o.order_number, o.status, DATE_FORMAT(o.order_date, '%Y-%m-%d') AS order_date,
              DATE_FORMAT(o.expected_date, '%Y-%m-%d') AS expected_date, c.name AS customer_name, sl.name AS location_name,
              ${TOTAL} AS total, (SELECT COALESCE(SUM(qty_ordered), 0) FROM sales_order_lines WHERE sales_order_id = o.id) AS qty_ordered,
              ${DELIVERED} AS qty_delivered
         FROM sales_orders o
         JOIN customers c ON c.id = o.customer_id
         LEFT JOIN sales_locations sl ON sl.id = o.sales_location_id
         ${where}
        ORDER BY o.order_date DESC, o.id DESC
        LIMIT ? OFFSET ?`,
      [...params, paging.pageSize, paging.offset],
    );
    return { rows, total: Number(countRows[0].total), page: paging.page, pageSize: paging.pageSize };
  }

  async findOne(id: number) {
    const [headRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT o.id, o.order_number, o.status, o.remarks, o.customer_id, c.name AS customer_name, c.payment_terms,
              o.sales_location_id, sl.name AS location_name, o.quotation_id, q.quotation_number,
              DATE_FORMAT(o.order_date, '%Y-%m-%d') AS order_date, DATE_FORMAT(o.expected_date, '%Y-%m-%d') AS expected_date,
              u.name AS created_by_name, ${TOTAL} AS total
         FROM sales_orders o
         JOIN customers c ON c.id = o.customer_id
         LEFT JOIN sales_locations sl ON sl.id = o.sales_location_id
         LEFT JOIN quotations q ON q.id = o.quotation_id
         LEFT JOIN users u ON u.id = o.created_by
        WHERE o.id = ?`,
      [id],
    );
    const head = headRows[0];
    if (!head) throw new NotFoundException(`Sales order ${id} not found`);

    const [lines] = await this.pool.query<RowDataPacket[]>(
      `SELECT l.id, l.product_id, p.code AS product_code, p.name AS product_name, p.output_unit AS unit, l.qty_ordered, l.rate,
              l.tax_percent, l.discount, ${lineAmountSql('l.qty_ordered', 'l.rate', 'l.tax_percent', 'l.discount')} AS amount,
              COALESCE((SELECT SUM(dl.qty_delivered) FROM delivery_note_lines dl WHERE dl.sales_order_line_id = l.id), 0) AS qty_delivered
         FROM sales_order_lines l JOIN bundle_products p ON p.id = l.product_id
        WHERE l.sales_order_id = ? ORDER BY l.id`,
      [id],
    );
    const [notes] = await this.pool.query<RowDataPacket[]>(
      `SELECT d.id, d.dn_number, DATE_FORMAT(d.delivery_date, '%Y-%m-%d') AS delivery_date, si.id AS invoice_id, si.invoice_number
         FROM delivery_notes d LEFT JOIN sales_invoices si ON si.delivery_note_id = d.id
        WHERE d.sales_order_id = ? ORDER BY d.id`,
      [id],
    );
    return { ...head, lines, deliveryNotes: notes };
  }

  /** Inserts an order and its lines inside the caller's transaction (used by a quotation converting too). */
  async createInTx(conn: PoolConnection, data: NewOrder, userId: number) {
    const [result] = await conn.query<any>(
      `INSERT INTO sales_orders (order_number, customer_id, sales_location_id, quotation_id, order_date, expected_date, remarks, created_by)
       VALUES ('', ?, ?, ?, ?, ?, ?, ?)`,
      [data.customerId, data.salesLocationId, data.quotationId, data.orderDate, data.expectedDate, data.remarks, userId],
    );
    const id = result.insertId as number;
    await conn.query('UPDATE sales_orders SET order_number = ? WHERE id = ?', [docNumber('SO', id), id]);
    for (const l of data.lines) {
      await conn.query(
        'INSERT INTO sales_order_lines (sales_order_id, product_id, qty_ordered, rate, tax_percent, discount) VALUES (?, ?, ?, ?, ?, ?)',
        [id, l.productId, l.qty, l.rate, l.taxPercent, l.discount],
      );
    }
    return id;
  }

  async create(dto: CreateSalesOrderDto, userId: number) {
    const orderDate = dto.orderDate ?? todayStr();
    if (dto.expectedDate && dto.expectedDate < orderDate) throw new BadRequestException('The expected date cannot be before the order date.');
    await assertCustomer(this.pool, dto.customerId);
    const salesLocationId = await assertLocation(this.pool, dto.salesLocationId);
    await assertLines(this.pool, dto.lines);

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const id = await this.createInTx(
        conn,
        {
          customerId: dto.customerId,
          salesLocationId,
          quotationId: null,
          orderDate,
          expectedDate: dto.expectedDate ?? null,
          remarks: dto.remarks?.trim() || null,
          lines: dto.lines,
        },
        userId,
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

  /** Called by the delivery notes service inside its transaction: the order follows what has been delivered. */
  async recomputeDeliveryStatus(conn: PoolConnection, orderId: number) {
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT o.status, (SELECT COALESCE(SUM(qty_ordered), 0) FROM sales_order_lines WHERE sales_order_id = o.id) AS ordered,
              ${DELIVERED} AS delivered
         FROM sales_orders o WHERE o.id = ?`,
      [orderId],
    );
    const { status, ordered, delivered } = rows[0];
    if (status === ORDER_STATUS.Cancelled) return;
    const next = delivered <= 0 ? ORDER_STATUS.Open : delivered < ordered ? ORDER_STATUS.PartiallyDelivered : ORDER_STATUS.Delivered;
    if (next !== status) await conn.query('UPDATE sales_orders SET status = ? WHERE id = ?', [next, orderId]);
  }

  /** An order nothing has been delivered against can be cancelled. */
  async cancel(id: number) {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT status FROM sales_orders WHERE id = ?', [id]);
    if (!rows[0]) throw new NotFoundException(`Sales order ${id} not found`);
    if (rows[0].status !== ORDER_STATUS.Open) {
      throw new ConflictException('Only an order with nothing delivered yet can be cancelled.');
    }
    await this.pool.query('UPDATE sales_orders SET status = ? WHERE id = ?', [ORDER_STATUS.Cancelled, id]);
    return this.findOne(id);
  }
}
