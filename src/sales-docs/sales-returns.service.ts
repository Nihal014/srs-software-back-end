import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import type { Paged } from '../common/pagination.util.js';
import { docNumber, round2, round3, todayStr } from './sales-docs.interface.js';
import type { CreateSalesReturnDto } from './dto/sales-docs.dto.js';

@Injectable()
export class SalesReturnsService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async findAll(paging: { page: number; pageSize: number; offset: number }): Promise<Paged<any>> {
    const [countRows] = await this.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM sales_returns');
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT r.id, r.return_number, DATE_FORMAT(r.return_date, '%Y-%m-%d') AS return_date, r.total_amount,
              si.id AS invoice_id, si.invoice_number, c.name AS customer_name,
              (SELECT GROUP_CONCAT(DISTINCT p.name ORDER BY p.name SEPARATOR ', ') FROM sales_return_lines l
                 JOIN bundle_products p ON p.id = l.product_id WHERE l.sales_return_id = r.id) AS product_names
         FROM sales_returns r
         JOIN sales_invoices si ON si.id = r.sales_invoice_id
         JOIN customers c ON c.id = r.customer_id
        ORDER BY r.return_date DESC, r.id DESC
        LIMIT ? OFFSET ?`,
      [paging.pageSize, paging.offset],
    );
    return { rows, total: Number(countRows[0].total), page: paging.page, pageSize: paging.pageSize };
  }

  async findOne(id: number) {
    const [headRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT r.id, r.return_number, DATE_FORMAT(r.return_date, '%Y-%m-%d') AS return_date, r.total_amount, r.remarks,
              si.id AS invoice_id, si.invoice_number, r.customer_id, c.name AS customer_name, u.name AS created_by_name
         FROM sales_returns r
         JOIN sales_invoices si ON si.id = r.sales_invoice_id
         JOIN customers c ON c.id = r.customer_id
         LEFT JOIN users u ON u.id = r.created_by
        WHERE r.id = ?`,
      [id],
    );
    const head = headRows[0];
    if (!head) throw new NotFoundException(`Sales return ${id} not found`);
    const [lines] = await this.pool.query<RowDataPacket[]>(
      `SELECT l.id, l.product_id, p.code AS product_code, p.name AS product_name, p.output_unit AS unit, l.qty, l.amount, l.reason
         FROM sales_return_lines l JOIN bundle_products p ON p.id = l.product_id
        WHERE l.sales_return_id = ? ORDER BY l.id`,
      [id],
    );
    return { ...head, lines };
  }

  /** The "New sales return" screen: an invoice's lines that still have goods which can come back. */
  async newContext(invoiceId: number) {
    const [invRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT si.id, si.invoice_number, DATE_FORMAT(si.invoice_date, '%Y-%m-%d') AS invoice_date, si.customer_id, c.name AS customer_name
         FROM sales_invoices si JOIN customers c ON c.id = si.customer_id WHERE si.id = ?`,
      [invoiceId],
    );
    const invoice = invRows[0];
    if (!invoice) throw new NotFoundException(`Sales invoice ${invoiceId} not found`);
    const [lines] = await this.pool.query<RowDataPacket[]>(
      `SELECT l.id AS invoice_line_id, l.product_id, p.code AS product_code, p.name AS product_name, p.output_unit AS unit, l.qty,
              l.amount, ROUND(l.amount / l.qty, 4) AS unit_amount,
              COALESCE((SELECT SUM(rl.qty) FROM sales_return_lines rl WHERE rl.invoice_line_id = l.id), 0) AS qty_returned
         FROM sales_invoice_lines l JOIN bundle_products p ON p.id = l.product_id
        WHERE l.sales_invoice_id = ?
        HAVING l.qty - qty_returned > 0
        ORDER BY l.id`,
      [invoiceId],
    );
    return { invoice, lines: lines.map((l) => ({ ...l, returnable: round3(Number(l.qty) - Number(l.qty_returned)) })) };
  }

  async create(dto: CreateSalesReturnDto, userId: number) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [invRows] = await conn.query<RowDataPacket[]>('SELECT * FROM sales_invoices WHERE id = ? FOR UPDATE', [dto.invoiceId]);
      const invoice = invRows[0];
      if (!invoice) throw new NotFoundException(`Sales invoice ${dto.invoiceId} not found`);

      const returning = dto.lines.filter((l) => l.qty > 0);
      if (!returning.length) throw new BadRequestException('Enter a return quantity on at least one line.');
      if (new Set(returning.map((l) => l.invoiceLineId)).size !== returning.length) throw new BadRequestException('A line can only appear once.');

      const [lines] = await conn.query<RowDataPacket[]>(
        `SELECT l.id, l.product_id, l.qty, l.amount, p.name AS product_name,
                COALESCE((SELECT SUM(rl.qty) FROM sales_return_lines rl WHERE rl.invoice_line_id = l.id), 0) AS qty_returned,
                COALESCE((SELECT SUM(rl.amount) FROM sales_return_lines rl WHERE rl.invoice_line_id = l.id), 0) AS amount_returned
           FROM sales_invoice_lines l JOIN bundle_products p ON p.id = l.product_id
          WHERE l.sales_invoice_id = ?`,
        [dto.invoiceId],
      );
      const byId = new Map(lines.map((l) => [l.id as number, l]));

      const prepared: { line: RowDataPacket; qty: number; amount: number; reason: number }[] = [];
      for (const r of returning) {
        const line = byId.get(r.invoiceLineId);
        if (!line) throw new BadRequestException(`Line ${r.invoiceLineId} does not belong to ${invoice.invoice_number}.`);
        const returnable = round3(Number(line.qty) - Number(line.qty_returned));
        if (round3(r.qty) > returnable) {
          throw new BadRequestException(`"${line.product_name}": returning ${r.qty} is more than the ${returnable} that can still come back.`);
        }
        // The last piece takes whatever of the line's value is left, so rounding never leaves a few paise behind.
        const amount =
          round3(r.qty) === returnable
            ? round2(Number(line.amount) - Number(line.amount_returned))
            : round2((r.qty / Number(line.qty)) * Number(line.amount));
        prepared.push({ line, qty: r.qty, amount, reason: r.reason });
      }
      const total = round2(prepared.reduce((a, p) => a + p.amount, 0));

      const [result] = await conn.query<any>(
        `INSERT INTO sales_returns (return_number, sales_invoice_id, customer_id, return_date, total_amount, remarks, created_by)
         VALUES ('', ?, ?, ?, ?, ?, ?)`,
        [dto.invoiceId, invoice.customer_id, dto.returnDate ?? todayStr(), total, dto.remarks?.trim() || null, userId],
      );
      const id = result.insertId as number;
      const number = docNumber('SR', id);
      for (const p of prepared) {
        await conn.query(
          'INSERT INTO sales_return_lines (sales_return_id, invoice_line_id, product_id, qty, amount, reason) VALUES (?, ?, ?, ?, ?, ?)',
          [id, p.line.id, p.line.product_id, p.qty, p.amount, p.reason],
        );
      }
      // A negative row in the sales register takes the returned value out of revenue and out of what the customer owes.
      const [cust] = await conn.query<RowDataPacket[]>('SELECT name FROM customers WHERE id = ?', [invoice.customer_id]);
      const [sale] = await conn.query<any>(
        'INSERT INTO sales (sale_date, customer, customer_id, description, amount, created_by) VALUES (?, ?, ?, ?, ?, ?)',
        [dto.returnDate ?? todayStr(), cust[0].name, invoice.customer_id, `Return ${number} (invoice ${invoice.invoice_number})`, -total, userId],
      );
      await conn.query('UPDATE sales_returns SET return_number = ?, sale_id = ? WHERE id = ?', [number, sale.insertId, id]);

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
