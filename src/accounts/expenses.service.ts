import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import type { ListQuery } from './accounts.interface.js';
import type { UpsertExpenseDto } from './dto/transactions.dto.js';
import { addDateRange, addSearch, paging } from './list.util.js';

const SELECT = `
  SELECT e.id, DATE_FORMAT(e.expense_date, '%Y-%m-%d') AS expense_date, e.description,
         e.category_id, c.name AS category_name, c.pl_group,
         e.qty, e.amount, e.account_id, a.name AS account_name, e.bill_status, e.remarks
    FROM expenses e
    JOIN expense_categories c ON c.id = e.category_id
    JOIN accounts a ON a.id = e.account_id`;

@Injectable()
export class ExpensesService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async list(q: ListQuery) {
    const where: string[] = [];
    const params: unknown[] = [];
    addDateRange('e.expense_date', q, where, params);
    addSearch(['e.description', 'e.remarks'], q, where, params);
    if (q.categoryId) {
      where.push('e.category_id = ?');
      params.push(Number(q.categoryId));
    }
    if (q.accountId) {
      where.push('e.account_id = ?');
      params.push(Number(q.accountId));
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { page, pageSize, offset } = paging(q);

    const [rows] = await this.pool.query<RowDataPacket[]>(
      `${SELECT} ${clause} ORDER BY e.expense_date DESC, e.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    const [totals] = await this.pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total, COALESCE(SUM(e.amount), 0) AS sum FROM expenses e ${clause}`,
      params,
    );
    return { rows, page, pageSize, total: Number(totals[0].total), sum: Number(totals[0].sum) };
  }

  async findOne(id: number) {
    const [rows] = await this.pool.query<RowDataPacket[]>(`${SELECT} WHERE e.id = ?`, [id]);
    if (!rows[0]) throw new NotFoundException(`Expense ${id} not found`);
    return rows[0];
  }

  async create(dto: UpsertExpenseDto, userId: number) {
    await this.assertRefs(dto);
    const [result] = await this.pool.query<any>(
      `INSERT INTO expenses (expense_date, description, category_id, qty, amount, account_id, bill_status, remarks, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [dto.expenseDate, dto.description.trim(), dto.categoryId, dto.qty, dto.amount, dto.accountId, dto.billStatus, dto.remarks?.trim() || null, userId],
    );
    return this.findOne(result.insertId);
  }

  async update(id: number, dto: UpsertExpenseDto) {
    await this.findOne(id);
    await this.assertRefs(dto);
    await this.pool.query(
      `UPDATE expenses SET expense_date = ?, description = ?, category_id = ?, qty = ?, amount = ?,
              account_id = ?, bill_status = ?, remarks = ? WHERE id = ?`,
      [dto.expenseDate, dto.description.trim(), dto.categoryId, dto.qty, dto.amount, dto.accountId, dto.billStatus, dto.remarks?.trim() || null, id],
    );
    return this.findOne(id);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.pool.query('DELETE FROM expenses WHERE id = ?', [id]);
  }

  private async assertRefs(dto: UpsertExpenseDto) {
    const [cat] = await this.pool.query<RowDataPacket[]>('SELECT id FROM expense_categories WHERE id = ?', [dto.categoryId]);
    if (!cat[0]) throw new BadRequestException('Unknown expense category.');
    const [acc] = await this.pool.query<RowDataPacket[]>('SELECT id FROM accounts WHERE id = ?', [dto.accountId]);
    if (!acc[0]) throw new BadRequestException('Unknown account.');
  }
}
