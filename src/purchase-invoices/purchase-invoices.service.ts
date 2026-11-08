import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import type { Paged } from '../common/pagination.util.js';
import { PAYMENT_STATUS, type PaymentStatusFilter } from './purchase-invoice.interface.js';
import type { CreatePurchaseInvoiceDto, RecordPaymentDto } from './dto/purchase-invoice.dto.js';

const round2 = (n: number) => Math.round(n * 100) / 100;
const todayStr = () => new Date().toISOString().slice(0, 10);

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "Net 15 days" -> 15; "Cash on delivery" (no number) -> 0. */
export function termsToDays(terms: string | null | undefined) {
  const match = /(\d+)/.exec(terms ?? '');
  return match ? Number(match[1]) : 0;
}

const PAID = 'COALESCE(p.paid, 0)';
const FROM = `
  FROM purchase_invoices pi
  JOIN suppliers s ON s.id = pi.supplier_id
  JOIN grns g ON g.id = pi.grn_id
  LEFT JOIN (
    SELECT purchase_invoice_id, SUM(amount) AS paid FROM purchase_payments GROUP BY purchase_invoice_id
  ) p ON p.purchase_invoice_id = pi.id`;

const COLUMNS = `
  pi.id, pi.invoice_number, pi.supplier_invoice_no, pi.grn_id, g.grn_number, pi.supplier_id, s.name AS supplier_name,
         DATE_FORMAT(pi.invoice_date, '%Y-%m-%d') AS invoice_date, DATE_FORMAT(pi.due_date, '%Y-%m-%d') AS due_date,
         pi.amount, ${PAID} AS paid_amount, (pi.amount - ${PAID}) AS outstanding,
         CASE WHEN ${PAID} >= pi.amount THEN ${PAYMENT_STATUS.Paid} WHEN ${PAID} > 0 THEN ${PAYMENT_STATUS.PartPaid} ELSE ${PAYMENT_STATUS.Unpaid} END AS payment_status,
         (pi.amount - ${PAID} > 0 AND pi.due_date < CURDATE()) AS is_overdue`;
const SELECT = `SELECT ${COLUMNS} ${FROM}`;

@Injectable()
export class PurchaseInvoicesService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  private filters(status?: PaymentStatusFilter, supplierId?: number) {
    const where: string[] = [];
    const params: unknown[] = [];
    if (supplierId) {
      where.push('pi.supplier_id = ?');
      params.push(supplierId);
    }
    if (status === 'unpaid') where.push(`${PAID} = 0`);
    if (status === 'part-paid') where.push(`${PAID} > 0 AND ${PAID} < pi.amount`);
    if (status === 'paid') where.push(`${PAID} >= pi.amount`);
    if (status === 'overdue') where.push(`pi.amount - ${PAID} > 0 AND pi.due_date < CURDATE()`);
    return { clause: where.length ? `WHERE ${where.map((w) => `(${w})`).join(' AND ')}` : '', params };
  }

  async findAll(paging: { page: number; pageSize: number; offset: number }, status?: PaymentStatusFilter, supplierId?: number): Promise<Paged<any>> {
    const { clause, params } = this.filters(status, supplierId);
    const [countRows] = await this.pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total ${FROM} ${clause}`, params);
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `${SELECT} ${clause} ORDER BY pi.invoice_date DESC, pi.id DESC LIMIT ? OFFSET ?`,
      [...params, paging.pageSize, paging.offset],
    );
    return { rows, total: Number(countRows[0].total), page: paging.page, pageSize: paging.pageSize };
  }

  /** What is still owed to suppliers, and how much of it is past its due date. */
  async summary(supplierId?: number) {
    const { clause, params } = this.filters(undefined, supplierId);
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(CASE WHEN pi.amount - ${PAID} > 0 THEN pi.amount - ${PAID} END), 0) AS outstanding,
              COALESCE(SUM(CASE WHEN pi.amount - ${PAID} > 0 AND pi.due_date < CURDATE() THEN pi.amount - ${PAID} END), 0) AS overdue,
              COALESCE(SUM(pi.amount - ${PAID} > 0), 0) AS open_invoices,
              COALESCE(SUM(pi.amount - ${PAID} > 0 AND pi.due_date < CURDATE()), 0) AS overdue_invoices
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

  private async grnLines(grnId: number) {
    const [lines] = await this.pool.query<RowDataPacket[]>(
      `SELECT gl.id, i.code AS item_code, i.name AS item_name, i.unit, gl.qty_accepted, pol.rate, pol.tax_percent,
              ROUND((gl.qty_accepted * pol.rate - pol.discount * gl.qty_accepted / NULLIF(pol.qty_ordered, 0))
                    * (1 + pol.tax_percent / 100), 2) AS value
         FROM grn_lines gl
         JOIN purchase_order_lines pol ON pol.id = gl.purchase_order_line_id
         JOIN items i ON i.id = gl.item_id
        WHERE gl.grn_id = ? AND gl.qty_accepted > 0
        ORDER BY gl.id`,
      [grnId],
    );
    return { lines, grnValue: round2(lines.reduce((a, l) => a + Number(l.value), 0)) };
  }

  async findOne(id: number) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT ${COLUMNS}, pi.remarks, cu.name AS created_by_name, po.po_number, po.id AS purchase_order_id
         ${FROM}
         JOIN purchase_orders po ON po.id = g.purchase_order_id
         LEFT JOIN users cu ON cu.id = pi.created_by
        WHERE pi.id = ?`,
      [id],
    );
    const invoice = rows[0];
    if (!invoice) throw new NotFoundException(`Purchase invoice ${id} not found`);

    const [payments] = await this.pool.query<RowDataPacket[]>(
      `SELECT pp.id, DATE_FORMAT(pp.payment_date, '%Y-%m-%d') AS payment_date, pp.amount, pp.account_id, a.name AS account_name,
              pp.expense_id, c.name AS category_name, pp.reference, pp.remarks, u.name AS created_by_name
         FROM purchase_payments pp
         JOIN accounts a ON a.id = pp.account_id
         JOIN expenses e ON e.id = pp.expense_id
         JOIN expense_categories c ON c.id = e.category_id
         LEFT JOIN users u ON u.id = pp.created_by
        WHERE pp.purchase_invoice_id = ?
        ORDER BY pp.payment_date, pp.id`,
      [id],
    );
    const { grnValue } = await this.grnLines(invoice.grn_id);
    return { ...invoice, grn_value: grnValue, payments };
  }

  /** The "New purchase invoice" screen: the GRN being billed, what it is worth, and what the supplier's terms imply. */
  async newContext(grnId: number) {
    const [grnRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT g.id, g.grn_number, DATE_FORMAT(g.received_date, '%Y-%m-%d') AS received_date,
              po.po_number, s.id AS supplier_id, s.name AS supplier_name, s.payment_terms
         FROM grns g
         JOIN purchase_orders po ON po.id = g.purchase_order_id
         JOIN suppliers s ON s.id = po.supplier_id
        WHERE g.id = ?`,
      [grnId],
    );
    const grn = grnRows[0];
    if (!grn) throw new NotFoundException(`GRN ${grnId} not found`);

    const { lines, grnValue } = await this.grnLines(grnId);
    const [billed] = await this.pool.query<RowDataPacket[]>(
      'SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n FROM purchase_invoices WHERE grn_id = ?',
      [grnId],
    );
    const [credit] = await this.pool.query<RowDataPacket[]>(
      'SELECT COALESCE(SUM(total_amount), 0) AS total FROM purchase_returns WHERE supplier_id = ? AND credit_status = 1',
      [grn.supplier_id],
    );
    return {
      grn,
      lines,
      grnValue,
      alreadyInvoiced: round2(Number(billed[0].total)),
      invoiceCount: Number(billed[0].n),
      pendingReturnCredit: round2(Number(credit[0].total)),
      termsDays: termsToDays(grn.payment_terms),
    };
  }

  async create(dto: CreatePurchaseInvoiceDto, userId: number) {
    const [grnRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT g.id, s.id AS supplier_id, s.payment_terms
         FROM grns g
         JOIN purchase_orders po ON po.id = g.purchase_order_id
         JOIN suppliers s ON s.id = po.supplier_id
        WHERE g.id = ?`,
      [dto.grnId],
    );
    const grn = grnRows[0];
    if (!grn) throw new NotFoundException(`GRN ${dto.grnId} not found`);

    const dueDate = dto.dueDate ?? addDays(dto.invoiceDate, termsToDays(grn.payment_terms));
    if (dueDate < dto.invoiceDate) throw new BadRequestException('The due date cannot be before the invoice date.');

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      let id: number;
      try {
        const [result] = await conn.query<any>(
          `INSERT INTO purchase_invoices (invoice_number, supplier_invoice_no, grn_id, supplier_id, invoice_date, due_date, amount, remarks, created_by)
           VALUES ('', ?, ?, ?, ?, ?, ?, ?, ?)`,
          [dto.supplierInvoiceNo.trim(), dto.grnId, grn.supplier_id, dto.invoiceDate, dueDate, dto.amount, dto.remarks?.trim() || null, userId],
        );
        id = result.insertId;
      } catch (err: any) {
        if (err?.code === 'ER_DUP_ENTRY') {
          throw new ConflictException(`This supplier already has an invoice numbered "${dto.supplierInvoiceNo.trim()}".`);
        }
        throw err;
      }
      await conn.query('UPDATE purchase_invoices SET invoice_number = ? WHERE id = ?', [`PI-${new Date().getFullYear()}-${String(id).padStart(4, '0')}`, id]);
      await conn.commit();
      return this.findOne(id);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** Records a payment and the matching expense in Accounts, so the Cash Book and Profit & Loss include it. */
  async recordPayment(invoiceId: number, dto: RecordPaymentDto, userId: number) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const [rows] = await conn.query<RowDataPacket[]>(
        `SELECT pi.id, pi.supplier_invoice_no, pi.amount, s.name AS supplier_name,
                (SELECT COALESCE(SUM(amount), 0) FROM purchase_payments WHERE purchase_invoice_id = pi.id) AS paid
           FROM purchase_invoices pi JOIN suppliers s ON s.id = pi.supplier_id
          WHERE pi.id = ? FOR UPDATE`,
        [invoiceId],
      );
      const invoice = rows[0];
      if (!invoice) throw new NotFoundException(`Purchase invoice ${invoiceId} not found`);

      const outstanding = round2(Number(invoice.amount) - Number(invoice.paid));
      if (outstanding <= 0) throw new ConflictException('This invoice is already fully paid.');
      if (round2(dto.amount) > outstanding) {
        throw new BadRequestException(`Only Rs ${outstanding.toFixed(2)} is outstanding on this invoice.`);
      }

      const [acc] = await conn.query<RowDataPacket[]>('SELECT id, is_active FROM accounts WHERE id = ?', [dto.accountId]);
      if (!acc[0]) throw new BadRequestException('Choose the account the payment was made from.');
      if (!acc[0].is_active) throw new BadRequestException('That account is inactive.');
      const [cat] = await conn.query<RowDataPacket[]>('SELECT id, is_active FROM expense_categories WHERE id = ?', [dto.categoryId]);
      if (!cat[0]) throw new BadRequestException('Choose an expense category.');
      if (!cat[0].is_active) throw new BadRequestException('That expense category is inactive.');

      const paymentDate = dto.paymentDate ?? todayStr();
      const [exp] = await conn.query<any>(
        `INSERT INTO expenses (expense_date, description, category_id, qty, amount, account_id, bill_status, remarks, created_by)
         VALUES (?, ?, ?, 1, ?, ?, 1, ?, ?)`,
        [
          paymentDate,
          `Payment to ${invoice.supplier_name} - invoice ${invoice.supplier_invoice_no}`,
          dto.categoryId,
          dto.amount,
          dto.accountId,
          dto.reference?.trim() || null,
          userId,
        ],
      );
      await conn.query(
        `INSERT INTO purchase_payments (purchase_invoice_id, payment_date, amount, account_id, expense_id, reference, remarks, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [invoiceId, paymentDate, dto.amount, dto.accountId, exp.insertId, dto.reference?.trim() || null, dto.remarks?.trim() || null, userId],
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

  /** Removes a payment recorded by mistake, together with the expense it created. */
  async deletePayment(invoiceId: number, paymentId: number) {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [rows] = await conn.query<RowDataPacket[]>(
        'SELECT id, expense_id FROM purchase_payments WHERE id = ? AND purchase_invoice_id = ? FOR UPDATE',
        [paymentId, invoiceId],
      );
      const payment = rows[0];
      if (!payment) throw new NotFoundException(`Payment ${paymentId} not found on this invoice`);
      await conn.query('DELETE FROM purchase_payments WHERE id = ?', [paymentId]);
      await conn.query('DELETE FROM expenses WHERE id = ?', [payment.expense_id]);
      await conn.commit();
      return this.findOne(invoiceId);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async remove(id: number) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT (SELECT COUNT(*) FROM purchase_payments WHERE purchase_invoice_id = pi.id) AS payments FROM purchase_invoices pi WHERE pi.id = ?',
      [id],
    );
    if (!rows[0]) throw new NotFoundException(`Purchase invoice ${id} not found`);
    if (Number(rows[0].payments) > 0) {
      throw new ConflictException('This invoice has payments recorded. Delete the payments first.');
    }
    await this.pool.query('DELETE FROM purchase_invoices WHERE id = ?', [id]);
  }
}
