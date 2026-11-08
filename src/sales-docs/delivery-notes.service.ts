import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import type { Paged } from '../common/pagination.util.js';
import { SalesOrdersService } from './sales-orders.service.js';
import { ORDER_STATUS, docNumber, round3, todayStr } from './sales-docs.interface.js';
import type { CreateDeliveryNoteDto } from './dto/sales-docs.dto.js';

const DELIVERABLE: number[] = [ORDER_STATUS.Open, ORDER_STATUS.PartiallyDelivered];

@Injectable()
export class DeliveryNotesService {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly orders: SalesOrdersService,
  ) {}

  async findAll(paging: { page: number; pageSize: number; offset: number }): Promise<Paged<any>> {
    const [countRows] = await this.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM delivery_notes');
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT d.id, d.dn_number, DATE_FORMAT(d.delivery_date, '%Y-%m-%d') AS delivery_date, d.received_by,
              o.id AS sales_order_id, o.order_number, c.name AS customer_name, si.id AS invoice_id, si.invoice_number,
              (SELECT COALESCE(SUM(qty_delivered), 0) FROM delivery_note_lines WHERE delivery_note_id = d.id) AS qty_delivered,
              (SELECT GROUP_CONCAT(DISTINCT p.name ORDER BY p.name SEPARATOR ', ') FROM delivery_note_lines l
                 JOIN bundle_products p ON p.id = l.product_id WHERE l.delivery_note_id = d.id) AS product_names
         FROM delivery_notes d
         JOIN sales_orders o ON o.id = d.sales_order_id
         JOIN customers c ON c.id = o.customer_id
         LEFT JOIN sales_invoices si ON si.delivery_note_id = d.id
        ORDER BY d.delivery_date DESC, d.id DESC
        LIMIT ? OFFSET ?`,
      [paging.pageSize, paging.offset],
    );
    return { rows, total: Number(countRows[0].total), page: paging.page, pageSize: paging.pageSize };
  }

  async findOne(id: number) {
    const [headRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT d.id, d.dn_number, DATE_FORMAT(d.delivery_date, '%Y-%m-%d') AS delivery_date, d.received_by, d.vehicle_no, d.remarks,
              o.id AS sales_order_id, o.order_number, o.customer_id, c.name AS customer_name, sl.name AS location_name,
              si.id AS invoice_id, si.invoice_number, u.name AS created_by_name
         FROM delivery_notes d
         JOIN sales_orders o ON o.id = d.sales_order_id
         JOIN customers c ON c.id = o.customer_id
         LEFT JOIN sales_locations sl ON sl.id = o.sales_location_id
         LEFT JOIN sales_invoices si ON si.delivery_note_id = d.id
         LEFT JOIN users u ON u.id = d.created_by
        WHERE d.id = ?`,
      [id],
    );
    const head = headRows[0];
    if (!head) throw new NotFoundException(`Delivery note ${id} not found`);
    const [lines] = await this.pool.query<RowDataPacket[]>(
      `SELECT l.id, l.product_id, p.code AS product_code, p.name AS product_name, p.output_unit AS unit, l.qty_delivered,
              ol.qty_ordered, ol.rate
         FROM delivery_note_lines l
         JOIN bundle_products p ON p.id = l.product_id
         JOIN sales_order_lines ol ON ol.id = l.sales_order_line_id
        WHERE l.delivery_note_id = ? ORDER BY l.id`,
      [id],
    );
    return { ...head, lines };
  }

  /** The "New delivery note" screen: an order's lines that still have something left to deliver. */
  async newContext(orderId: number) {
    const [orderRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT o.id, o.order_number, o.status, c.name AS customer_name, sl.name AS location_name
         FROM sales_orders o JOIN customers c ON c.id = o.customer_id
         LEFT JOIN sales_locations sl ON sl.id = o.sales_location_id
        WHERE o.id = ?`,
      [orderId],
    );
    const order = orderRows[0];
    if (!order) throw new NotFoundException(`Sales order ${orderId} not found`);
    if (!DELIVERABLE.includes(order.status)) {
      throw new ConflictException(`${order.order_number} has nothing left to deliver.`);
    }
    const [lines] = await this.pool.query<RowDataPacket[]>(
      `SELECT l.id AS order_line_id, l.product_id, p.code AS product_code, p.name AS product_name, p.output_unit AS unit, l.qty_ordered,
              COALESCE((SELECT SUM(dl.qty_delivered) FROM delivery_note_lines dl WHERE dl.sales_order_line_id = l.id), 0) AS qty_delivered
         FROM sales_order_lines l JOIN bundle_products p ON p.id = l.product_id
        WHERE l.sales_order_id = ?
        HAVING l.qty_ordered - qty_delivered > 0
        ORDER BY l.id`,
      [orderId],
    );
    return { order, lines: lines.map((l) => ({ ...l, outstanding: round3(Number(l.qty_ordered) - Number(l.qty_delivered)) })) };
  }

  async create(dto: CreateDeliveryNoteDto, userId: number) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [orderRows] = await conn.query<RowDataPacket[]>('SELECT * FROM sales_orders WHERE id = ? FOR UPDATE', [dto.salesOrderId]);
      const order = orderRows[0];
      if (!order) throw new NotFoundException(`Sales order ${dto.salesOrderId} not found`);
      if (!DELIVERABLE.includes(order.status)) throw new ConflictException(`${order.order_number} has nothing left to deliver.`);

      const [lines] = await conn.query<RowDataPacket[]>(
        `SELECT l.id, l.product_id, l.qty_ordered, p.name AS product_name,
                COALESCE((SELECT SUM(dl.qty_delivered) FROM delivery_note_lines dl WHERE dl.sales_order_line_id = l.id), 0) AS qty_delivered
           FROM sales_order_lines l JOIN bundle_products p ON p.id = l.product_id
          WHERE l.sales_order_id = ?`,
        [dto.salesOrderId],
      );
      const byId = new Map(lines.map((l) => [l.id as number, l]));
      const sending = dto.lines.filter((l) => l.qty > 0);
      if (!sending.length) throw new BadRequestException('Enter a delivered quantity on at least one line.');
      if (new Set(sending.map((l) => l.orderLineId)).size !== sending.length) throw new BadRequestException('A line can only appear once.');
      for (const l of sending) {
        const ol = byId.get(l.orderLineId);
        if (!ol) throw new BadRequestException(`Line ${l.orderLineId} does not belong to ${order.order_number}.`);
        const outstanding = round3(Number(ol.qty_ordered) - Number(ol.qty_delivered));
        if (round3(l.qty) > outstanding) {
          throw new BadRequestException(`"${ol.product_name}": delivering ${l.qty} is more than the ${outstanding} still to deliver.`);
        }
      }

      const [result] = await conn.query<any>(
        `INSERT INTO delivery_notes (dn_number, sales_order_id, delivery_date, received_by, vehicle_no, remarks, created_by)
         VALUES ('', ?, ?, ?, ?, ?, ?)`,
        [dto.salesOrderId, dto.deliveryDate ?? todayStr(), dto.receivedBy?.trim() || null, dto.vehicleNo?.trim() || null, dto.remarks?.trim() || null, userId],
      );
      const id = result.insertId as number;
      await conn.query('UPDATE delivery_notes SET dn_number = ? WHERE id = ?', [docNumber('DN', id), id]);
      for (const l of sending) {
        const ol = byId.get(l.orderLineId)!;
        await conn.query(
          'INSERT INTO delivery_note_lines (delivery_note_id, sales_order_line_id, product_id, qty_delivered) VALUES (?, ?, ?, ?)',
          [id, l.orderLineId, ol.product_id, l.qty],
        );
      }
      await this.orders.recomputeDeliveryStatus(conn, dto.salesOrderId);

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
