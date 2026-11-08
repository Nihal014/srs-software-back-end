import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import type { ListQuery } from './accounts.interface.js';
import { RECEIPT_SOURCE } from './accounts.interface.js';
import type { UpsertReceiptDto } from './dto/transactions.dto.js';
import { addDateRange, addSearch, paging } from './list.util.js';

const SELECT = `
  SELECT r.id, DATE_FORMAT(r.receipt_date, '%Y-%m-%d') AS receipt_date, r.source, r.description,
         r.amount, r.account_id, a.name AS account_name, r.customer_id, cu.name AS customer_name, r.remarks
    FROM receipts r
    JOIN accounts a ON a.id = r.account_id
    LEFT JOIN customers cu ON cu.id = r.customer_id`;

@Injectable()
export class ReceiptsService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async list(q: ListQuery) {
    const where: string[] = [];
    const params: unknown[] = [];
    addDateRange('r.receipt_date', q, where, params);
    addSearch(['r.description', 'r.remarks'], q, where, params);
    if (q.accountId) {
      where.push('r.account_id = ?');
      params.push(Number(q.accountId));
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { page, pageSize, offset } = paging(q);

    const [rows] = await this.pool.query<RowDataPacket[]>(
      `${SELECT} ${clause} ORDER BY r.receipt_date DESC, r.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    const [totals] = await this.pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total, COALESCE(SUM(r.amount), 0) AS sum FROM receipts r ${clause}`,
      params,
    );
    return { rows, page, pageSize, total: Number(totals[0].total), sum: Number(totals[0].sum) };
  }

  async findOne(id: number) {
    const [rows] = await this.pool.query<RowDataPacket[]>(`${SELECT} WHERE r.id = ?`, [id]);
    if (!rows[0]) throw new NotFoundException(`Receipt ${id} not found`);
    return rows[0];
  }

  async create(dto: UpsertReceiptDto, userId: number) {
    await this.assertAccount(dto.accountId);
    const customerId = await this.customerFor(dto);
    const [result] = await this.pool.query<any>(
      `INSERT INTO receipts (receipt_date, source, description, amount, account_id, customer_id, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [dto.receiptDate, dto.source, dto.description.trim(), dto.amount, dto.accountId, customerId, dto.remarks?.trim() || null, userId],
    );
    return this.findOne(result.insertId);
  }

  async update(id: number, dto: UpsertReceiptDto) {
    await this.assertEditable(id);
    await this.assertAccount(dto.accountId);
    const customerId = await this.customerFor(dto);
    await this.pool.query(
      `UPDATE receipts SET receipt_date = ?, source = ?, description = ?, amount = ?, account_id = ?, customer_id = ?, remarks = ? WHERE id = ?`,
      [dto.receiptDate, dto.source, dto.description.trim(), dto.amount, dto.accountId, customerId, dto.remarks?.trim() || null, id],
    );
    return this.findOne(id);
  }

  async remove(id: number) {
    await this.assertEditable(id);
    await this.pool.query('DELETE FROM receipts WHERE id = ?', [id]);
  }

  /** A receipt created by a payment on a sales invoice is managed from that invoice. */
  private async assertEditable(id: number) {
    await this.findOne(id);
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT si.invoice_number FROM sales_invoice_payments sp JOIN sales_invoices si ON si.id = sp.sales_invoice_id WHERE sp.receipt_id = ?',
      [id],
    );
    if (rows[0]) throw new ConflictException(`This receipt is a payment on ${rows[0].invoice_number}. Change it from that invoice instead.`);
  }

  /** Only a customer payment belongs to a customer; any other kind of receipt ignores the field. */
  private async customerFor(dto: UpsertReceiptDto): Promise<number | null> {
    if (dto.source !== RECEIPT_SOURCE.SalesPayment || !dto.customerId) return null;
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT id FROM customers WHERE id = ?', [dto.customerId]);
    if (!rows[0]) throw new BadRequestException('Unknown customer.');
    return dto.customerId;
  }

  private async assertAccount(accountId: number) {
    const [acc] = await this.pool.query<RowDataPacket[]>('SELECT id FROM accounts WHERE id = ?', [accountId]);
    if (!acc[0]) throw new BadRequestException('Unknown account.');
  }
}
