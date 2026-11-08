import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import type { Paged } from '../common/pagination.util.js';
import { RECEIPT_SOURCE } from '../accounts/accounts.interface.js';
import { PAYMENT_STATUS, type PaymentStatusFilter } from '../purchase-invoices/purchase-invoice.interface.js';
import { termsToDays } from '../purchase-invoices/purchase-invoices.service.js';
import {
  addDays,
  assertCustomer,
  assertLines,
  assertLocation,
  docNumber,
  lineAmount,
  round2,
  todayStr,
} from './sales-docs.interface.js';
import type { CreateSalesInvoiceDto, RecordSalesPaymentDto } from './dto/sales-docs.dto.js';

// paid = money received; credited = value of goods the customer sent back (sales returns).
const PAID = 'COALESCE(p.paid, 0)';
const CREDITED = 'COALESCE(r.credited, 0)';
const OUTSTANDING = `(si.amount - ${PAID} - ${CREDITED})`;
const FROM = `
  FROM sales_invoices si
  JOIN customers c ON c.id = si.customer_id
  LEFT JOIN (SELECT sales_invoice_id, SUM(amount) AS paid FROM sales_invoice_payments GROUP BY sales_invoice_id) p ON p.sales_invoice_id = si.id
  LEFT JOIN (SELECT sales_invoice_id, SUM(total_amount) AS credited FROM sales_returns GROUP BY sales_invoice_id) r ON r.sales_invoice_id = si.id`;
const COLUMNS = `
  si.id, si.invoice_number, si.customer_id, c.name AS customer_name, si.sales_order_id, si.delivery_note_id,
  DATE_FORMAT(si.invoice_date, '%Y-%m-%d') AS invoice_date, DATE_FORMAT(si.due_date, '%Y-%m-%d') AS due_date, si.amount,
  ${PAID} AS paid_amount, ${CREDITED} AS credited_amount, ${OUTSTANDING} AS outstanding,
  CASE WHEN ${OUTSTANDING} <= 0 THEN ${PAYMENT_STATUS.Paid} WHEN ${PAID} + ${CREDITED} > 0 THEN ${PAYMENT_STATUS.PartPaid} ELSE ${PAYMENT_STATUS.Unpaid} END AS payment_status,
  (${OUTSTANDING} > 0 AND si.due_date < CURDATE()) AS is_overdue`;

@Injectable()
export class SalesInvoicesService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  private filters(status?: PaymentStatusFilter, customerId?: number) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (customerId) {
      where.push('si.customer_id = ?');
      params.push(customerId);
    }
    if (status === 'unpaid') where.push(`${PAID} + ${CREDITED} = 0`);
    if (status === 'part-paid') where.push(`${PAID} + ${CREDITED} > 0 AND ${OUTSTANDING} > 0`);
    if (status === 'paid') where.push(`${OUTSTANDING} <= 0`);
    if (status === 'overdue') where.push(`${OUTSTANDING} > 0 AND si.due_date < CURDATE()`);
    return { clause: where.length ? `WHERE ${where.map((w) => `(${w})`).join(' AND ')}` : '', params };
  }

  async findAll(paging: { page: number; pageSize: number; offset: number }, status?: PaymentStatusFilter, customerId?: number): Promise<Paged<any>> {
    const { clause, params } = this.filters(status, customerId);
    const [countRows] = await this.pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total ${FROM} ${clause}`, params);
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT ${COLUMNS} ${FROM} ${clause} ORDER BY si.invoice_date DESC, si.id DESC LIMIT ? OFFSET ?`,
      [...params, paging.pageSize, paging.offset],
    );
    return { rows, total: Number(countRows[0].total), page: paging.page, pageSize: paging.pageSize };
  }

  /** What customers still owe on invoices, and how much of it is past its due date. */
  async summary(customerId?: number) {
    const { clause, params } = this.filters(undefined, customerId);
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(CASE WHEN ${OUTSTANDING} > 0 THEN ${OUTSTANDING} END), 0) AS outstanding,
              COALESCE(SUM(CASE WHEN ${OUTSTANDING} > 0 AND si.due_date < CURDATE() THEN ${OUTSTANDING} END), 0) AS overdue,
              COALESCE(SUM(${OUTSTANDING} > 0), 0) AS open_invoices,
              COALESCE(SUM(${OUTSTANDING} > 0 AND si.due_date < CURDATE()), 0) AS overdue_invoices
       ${FROM} ${clause}`,
      params,
    );
    const r = rows[0];
    return {
      outstanding: round2(Number(r.outstanding)),
      overdue: round2(Number(r.overdue)),
      openInvoices: Number(r.open_invoices),
      overdueInvoices: Number(r.overdue_invoices),
    };
  }

  async findOne(id: number) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT ${COLUMNS}, si.remarks, si.sales_location_id, sl.name AS location_name, so.order_number, dn.dn_number, u.name AS created_by_name
         ${FROM}
         LEFT JOIN sales_locations sl ON sl.id = si.sales_location_id
         LEFT JOIN sales_orders so ON so.id = si.sales_order_id
         LEFT JOIN delivery_notes dn ON dn.id = si.delivery_note_id
         LEFT JOIN users u ON u.id = si.created_by
        WHERE si.id = ?`,
      [id],
    );
    const invoice = rows[0];
    if (!invoice) throw new NotFoundException(`Sales invoice ${id} not found`);

    const [lines] = await this.pool.query<RowDataPacket[]>(
      `SELECT l.id, l.product_id, p.code AS product_code, p.name AS product_name, p.output_unit AS unit, l.qty, l.rate, l.tax_percent,
              l.discount, l.amount,
              COALESCE((SELECT SUM(rl.qty) FROM sales_return_lines rl WHERE rl.invoice_line_id = l.id), 0) AS qty_returned
         FROM sales_invoice_lines l JOIN bundle_products p ON p.id = l.product_id
        WHERE l.sales_invoice_id = ? ORDER BY l.id`,
      [id],
    );
    const [payments] = await this.pool.query<RowDataPacket[]>(
      `SELECT sp.id, DATE_FORMAT(sp.payment_date, '%Y-%m-%d') AS payment_date, sp.amount, a.name AS account_name, sp.reference, sp.remarks
         FROM sales_invoice_payments sp JOIN accounts a ON a.id = sp.account_id
        WHERE sp.sales_invoice_id = ? ORDER BY sp.payment_date, sp.id`,
      [id],
    );
    const [returns] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, return_number, DATE_FORMAT(return_date, '%Y-%m-%d') AS return_date, total_amount
         FROM sales_returns WHERE sales_invoice_id = ? ORDER BY id`,
      [id],
    );
    return { ...invoice, lines, payments, returns };
  }

  /** Prefills an invoice from a delivery note: delivered qty at the order's rate, with the discount shared by qty. */
  async newContext(deliveryNoteId: number) {
    const [noteRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT d.id, d.dn_number, DATE_FORMAT(d.delivery_date, '%Y-%m-%d') AS delivery_date, o.id AS sales_order_id, o.order_number,
              o.customer_id, c.name AS customer_name, c.payment_terms, o.sales_location_id, si.invoice_number
         FROM delivery_notes d
         JOIN sales_orders o ON o.id = d.sales_order_id
         JOIN customers c ON c.id = o.customer_id
         LEFT JOIN sales_invoices si ON si.delivery_note_id = d.id
        WHERE d.id = ?`,
      [deliveryNoteId],
    );
    const note = noteRows[0];
    if (!note) throw new NotFoundException(`Delivery note ${deliveryNoteId} not found`);
    if (note.invoice_number) throw new ConflictException(`${note.dn_number} has already been invoiced (${note.invoice_number}).`);

    const [lines] = await this.pool.query<RowDataPacket[]>(
      `SELECT l.product_id, p.name AS product_name, p.output_unit AS unit, l.qty_delivered AS qty, ol.rate, ol.tax_percent,
              ROUND(ol.discount * l.qty_delivered / NULLIF(ol.qty_ordered, 0), 2) AS discount
         FROM delivery_note_lines l
         JOIN sales_order_lines ol ON ol.id = l.sales_order_line_id
         JOIN bundle_products p ON p.id = l.product_id
        WHERE l.delivery_note_id = ? ORDER BY l.id`,
      [deliveryNoteId],
    );
    return { note, lines, termsDays: termsToDays(note.payment_terms) };
  }

  async create(dto: CreateSalesInvoiceDto, userId: number) {
    const customer = await assertCustomer(this.pool, dto.customerId);
    const salesLocationId = await assertLocation(this.pool, dto.salesLocationId);
    await assertLines(this.pool, dto.lines);

    const invoiceDate = dto.invoiceDate ?? todayStr();
    const dueDate = dto.dueDate ?? addDays(invoiceDate, termsToDays(customer.payment_terms));
    if (dueDate < invoiceDate) throw new BadRequestException('The due date cannot be before the invoice date.');
    const lineAmounts = dto.lines.map((l) => lineAmount(l));
    const amount = round2(lineAmounts.reduce((a, v) => a + v, 0));
    if (amount <= 0) throw new BadRequestException('The invoice total must be above 0.');

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      let salesOrderId: number | null = null;
      if (dto.deliveryNoteId) {
        const [noteRows] = await conn.query<RowDataPacket[]>(
          `SELECT d.id, d.dn_number, o.id AS order_id, o.customer_id, si.id AS invoice_id
             FROM delivery_notes d JOIN sales_orders o ON o.id = d.sales_order_id
             LEFT JOIN sales_invoices si ON si.delivery_note_id = d.id
            WHERE d.id = ? FOR UPDATE`,
          [dto.deliveryNoteId],
        );
        const note = noteRows[0];
        if (!note) throw new NotFoundException(`Delivery note ${dto.deliveryNoteId} not found`);
        if (note.invoice_id) throw new ConflictException(`${note.dn_number} has already been invoiced.`);
        if (note.customer_id !== dto.customerId) throw new BadRequestException('The customer does not match the delivery note.');
        salesOrderId = note.order_id;
      }

      const [result] = await conn.query<any>(
        `INSERT INTO sales_invoices (invoice_number, customer_id, sales_order_id, delivery_note_id, sales_location_id, invoice_date, due_date, amount, remarks, created_by)
         VALUES ('', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [dto.customerId, salesOrderId, dto.deliveryNoteId ?? null, salesLocationId, invoiceDate, dueDate, amount, dto.remarks?.trim() || null, userId],
      );
      const id = result.insertId as number;
      const number = docNumber('SI', id);
      for (const [i, l] of dto.lines.entries()) {
        await conn.query(
          'INSERT INTO sales_invoice_lines (sales_invoice_id, product_id, qty, rate, tax_percent, discount, amount) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, l.productId, l.qty, l.rate, l.taxPercent, l.discount, lineAmounts[i]],
        );
      }
      // The sales register (and so Profit & Loss and what customers owe) gets the invoice automatically.
      const [sale] = await conn.query<any>(
        'INSERT INTO sales (sale_date, customer, customer_id, description, amount, created_by) VALUES (?, ?, ?, ?, ?, ?)',
        [invoiceDate, customer.name, customer.id, `Invoice ${number}`, amount, userId],
      );
      await conn.query('UPDATE sales_invoices SET invoice_number = ?, sale_id = ? WHERE id = ?', [number, sale.insertId, id]);

      await conn.commit();
      return this.findOne(id);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** Records money received and the customer-payment receipt it stands for in Accounts. */
  async recordPayment(invoiceId: number, dto: RecordSalesPaymentDto, userId: number) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT si.id, si.invoice_number, si.customer_id, si.amount,
                (SELECT COALESCE(SUM(amount), 0) FROM sales_invoice_payments WHERE sales_invoice_id = si.id) AS paid,
                (SELECT COALESCE(SUM(total_amount), 0) FROM sales_returns WHERE sales_invoice_id = si.id) AS credited
           FROM sales_invoices si WHERE si.id = ? FOR UPDATE`,
        [invoiceId],
      );
      const invoice = rows[0];
      if (!invoice) throw new NotFoundException(`Sales invoice ${invoiceId} not found`);

      const outstanding = round2(Number(invoice.amount) - Number(invoice.paid) - Number(invoice.credited));
      if (outstanding <= 0) throw new ConflictException('This invoice has nothing outstanding.');
      if (round2(dto.amount) > outstanding) throw new BadRequestException(`Only Rs ${outstanding.toFixed(2)} is outstanding on this invoice.`);

      const [acc] = await conn.query<RowDataPacket[]>('SELECT id, is_active FROM accounts WHERE id = ?', [dto.accountId]);
      if (!acc[0]) throw new BadRequestException('Choose the account the money was received into.');
      if (!acc[0].is_active) throw new BadRequestException('That account is inactive.');

      const paymentDate = dto.paymentDate ?? todayStr();
      const [receipt] = await conn.query<any>(
        `INSERT INTO receipts (receipt_date, source, description, amount, account_id, customer_id, remarks, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [paymentDate, RECEIPT_SOURCE.SalesPayment, `Payment for ${invoice.invoice_number}`, dto.amount, dto.accountId, invoice.customer_id, dto.reference?.trim() || null, userId],
      );
      await conn.query(
        `INSERT INTO sales_invoice_payments (sales_invoice_id, payment_date, amount, account_id, receipt_id, reference, remarks, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [invoiceId, paymentDate, dto.amount, dto.accountId, receipt.insertId, dto.reference?.trim() || null, dto.remarks?.trim() || null, userId],
      );
      await conn.commit();
      return this.findOne(invoiceId);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** Removes a payment entered by mistake, with the receipt it created. */
  async deletePayment(invoiceId: number, paymentId: number) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<RowDataPacket[]>(
        'SELECT id, receipt_id FROM sales_invoice_payments WHERE id = ? AND sales_invoice_id = ? FOR UPDATE',
        [paymentId, invoiceId],
      );
      if (!rows[0]) throw new NotFoundException(`Payment ${paymentId} not found on this invoice`);
      await conn.query('DELETE FROM sales_invoice_payments WHERE id = ?', [paymentId]);
      await conn.query('DELETE FROM receipts WHERE id = ?', [rows[0].receipt_id]);
      await conn.commit();
      return this.findOne(invoiceId);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** An invoice with no payments or returns can be deleted; its sales register row goes with it. */
  async remove(id: number) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT si.id, si.sale_id,
                (SELECT COUNT(*) FROM sales_invoice_payments WHERE sales_invoice_id = si.id) AS payments,
                (SELECT COUNT(*) FROM sales_returns WHERE sales_invoice_id = si.id) AS returns
           FROM sales_invoices si WHERE si.id = ? FOR UPDATE`,
        [id],
      );
      const invoice = rows[0];
      if (!invoice) throw new NotFoundException(`Sales invoice ${id} not found`);
      if (Number(invoice.payments) > 0) throw new ConflictException('This invoice has payments recorded. Delete the payments first.');
      if (Number(invoice.returns) > 0) throw new ConflictException('This invoice has sales returns against it, so it cannot be deleted.');
      await conn.query('DELETE FROM sales_invoices WHERE id = ?', [id]);
      if (invoice.sale_id) await conn.query('DELETE FROM sales WHERE id = ?', [invoice.sale_id]);
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}
