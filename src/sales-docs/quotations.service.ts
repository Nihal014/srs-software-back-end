import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import type { Paged } from '../common/pagination.util.js';
import { SalesOrdersService } from './sales-orders.service.js';
import {
  QUOTATION_STATUS,
  addDays,
  assertCustomer,
  assertLines,
  assertLocation,
  docNumber,
  lineAmountSql,
  todayStr,
} from './sales-docs.interface.js';
import type { CreateQuotationDto } from './dto/sales-docs.dto.js';

const TOTAL = `(SELECT COALESCE(SUM(${lineAmountSql('l.qty', 'l.rate', 'l.tax_percent', 'l.discount')}), 0)
                  FROM quotation_lines l WHERE l.quotation_id = q.id)`;

@Injectable()
export class QuotationsService {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly orders: SalesOrdersService,
  ) {}

  async findAll(paging: { page: number; pageSize: number; offset: number }, status?: number): Promise<Paged<any>> {
    const where = status ? 'WHERE q.status = ?' : '';
    const params = status ? [status] : [];
    const [countRows] = await this.pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM quotations q ${where}`, params);
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT q.id, q.quotation_number, q.status, DATE_FORMAT(q.quotation_date, '%Y-%m-%d') AS quotation_date,
              DATE_FORMAT(q.valid_until, '%Y-%m-%d') AS valid_until, (q.status = ${QUOTATION_STATUS.Open} AND q.valid_until < CURDATE()) AS is_expired,
              c.name AS customer_name, sl.name AS location_name, ${TOTAL} AS total
         FROM quotations q
         JOIN customers c ON c.id = q.customer_id
         LEFT JOIN sales_locations sl ON sl.id = q.sales_location_id
         ${where}
        ORDER BY q.quotation_date DESC, q.id DESC
        LIMIT ? OFFSET ?`,
      [...params, paging.pageSize, paging.offset],
    );
    return { rows, total: Number(countRows[0].total), page: paging.page, pageSize: paging.pageSize };
  }

  async findOne(id: number) {
    const [headRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT q.id, q.quotation_number, q.status, q.remarks, q.customer_id, c.name AS customer_name, c.payment_terms,
              q.sales_location_id, sl.name AS location_name,
              DATE_FORMAT(q.quotation_date, '%Y-%m-%d') AS quotation_date, DATE_FORMAT(q.valid_until, '%Y-%m-%d') AS valid_until,
              (q.status = ${QUOTATION_STATUS.Open} AND q.valid_until < CURDATE()) AS is_expired,
              u.name AS created_by_name, so.id AS sales_order_id, so.order_number, ${TOTAL} AS total
         FROM quotations q
         JOIN customers c ON c.id = q.customer_id
         LEFT JOIN sales_locations sl ON sl.id = q.sales_location_id
         LEFT JOIN users u ON u.id = q.created_by
         LEFT JOIN sales_orders so ON so.quotation_id = q.id
        WHERE q.id = ?`,
      [id],
    );
    const head = headRows[0];
    if (!head) throw new NotFoundException(`Quotation ${id} not found`);

    const [lines] = await this.pool.query<RowDataPacket[]>(
      `SELECT l.id, l.product_id, p.code AS product_code, p.name AS product_name, p.output_unit AS unit, l.qty, l.rate, l.tax_percent,
              l.discount, ${lineAmountSql('l.qty', 'l.rate', 'l.tax_percent', 'l.discount')} AS amount
         FROM quotation_lines l JOIN bundle_products p ON p.id = l.product_id
        WHERE l.quotation_id = ? ORDER BY l.id`,
      [id],
    );
    return { ...head, lines };
  }

  async create(dto: CreateQuotationDto, userId: number) {
    const quotationDate = dto.quotationDate ?? todayStr();
    const validUntil = dto.validUntil ?? addDays(quotationDate, 15);
    if (validUntil < quotationDate) throw new BadRequestException('The valid-until date cannot be before the quotation date.');
    await assertCustomer(this.pool, dto.customerId);
    const salesLocationId = await assertLocation(this.pool, dto.salesLocationId);
    await assertLines(this.pool, dto.lines);

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.query<any>(
        `INSERT INTO quotations (quotation_number, customer_id, sales_location_id, quotation_date, valid_until, remarks, created_by)
         VALUES ('', ?, ?, ?, ?, ?, ?)`,
        [dto.customerId, salesLocationId, quotationDate, validUntil, dto.remarks?.trim() || null, userId],
      );
      const id = result.insertId as number;
      await conn.query('UPDATE quotations SET quotation_number = ? WHERE id = ?', [docNumber('QT', id), id]);
      for (const l of dto.lines) {
        await conn.query(
          'INSERT INTO quotation_lines (quotation_id, product_id, qty, rate, tax_percent, discount) VALUES (?, ?, ?, ?, ?, ?)',
          [id, l.productId, l.qty, l.rate, l.taxPercent, l.discount],
        );
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

  private async open(id: number) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT status, (valid_until < CURDATE()) AS expired, quotation_number FROM quotations WHERE id = ?`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException(`Quotation ${id} not found`);
    return rows[0];
  }

  async accept(id: number) {
    const q = await this.open(id);
    if (q.status !== QUOTATION_STATUS.Open) throw new ConflictException(`${q.quotation_number} has already been answered.`);
    if (q.expired) throw new ConflictException(`${q.quotation_number} has expired. Make a new quotation at today's prices.`);
    await this.pool.query('UPDATE quotations SET status = ? WHERE id = ?', [QUOTATION_STATUS.Accepted, id]);
    return this.findOne(id);
  }

  async reject(id: number) {
    const q = await this.open(id);
    if (q.status !== QUOTATION_STATUS.Open) throw new ConflictException(`${q.quotation_number} has already been answered.`);
    await this.pool.query('UPDATE quotations SET status = ? WHERE id = ?', [QUOTATION_STATUS.Rejected, id]);
    return this.findOne(id);
  }

  /** An accepted quotation becomes a sales order with the same customer, location and lines. */
  async convert(id: number, userId: number) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<RowDataPacket[]>('SELECT * FROM quotations WHERE id = ? FOR UPDATE', [id]);
      const q = rows[0];
      if (!q) throw new NotFoundException(`Quotation ${id} not found`);
      if (q.status !== QUOTATION_STATUS.Accepted) {
        throw new ConflictException(`${q.quotation_number} must be accepted before it becomes a sales order.`);
      }
      const [lines] = await conn.query<RowDataPacket[]>('SELECT * FROM quotation_lines WHERE quotation_id = ? ORDER BY id', [id]);
      const orderId = await this.orders.createInTx(
        conn,
        {
          customerId: q.customer_id,
          salesLocationId: q.sales_location_id,
          quotationId: id,
          orderDate: todayStr(),
          expectedDate: null,
          remarks: q.remarks,
          lines: lines.map((l) => ({
            productId: l.product_id,
            qty: Number(l.qty),
            rate: Number(l.rate),
            taxPercent: Number(l.tax_percent),
            discount: Number(l.discount),
          })),
        },
        userId,
      );
      await conn.query('UPDATE quotations SET status = ? WHERE id = ?', [QUOTATION_STATUS.Converted, id]);
      await conn.commit();
      return this.orders.findOne(orderId);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** Only a quotation that is still open or was rejected can be deleted. */
  async remove(id: number) {
    const q = await this.open(id);
    if (q.status === QUOTATION_STATUS.Accepted || q.status === QUOTATION_STATUS.Converted) {
      throw new ConflictException(`${q.quotation_number} was accepted and can't be deleted.`);
    }
    await this.pool.query('DELETE FROM quotations WHERE id = ?', [id]);
  }
}
