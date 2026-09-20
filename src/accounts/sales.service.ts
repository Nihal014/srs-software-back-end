import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import type { ListQuery } from './accounts.interface.js';
import type { UpsertSaleDto } from './dto/transactions.dto.js';
import { addDateRange, addSearch, paging } from './list.util.js';

const SELECT = `
  SELECT s.id, DATE_FORMAT(s.sale_date, '%Y-%m-%d') AS sale_date, s.customer, s.description, s.amount, s.remarks
    FROM sales s`;

@Injectable()
export class SalesService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async list(q: ListQuery) {
    const where: string[] = [];
    const params: unknown[] = [];
    addDateRange('s.sale_date', q, where, params);
    addSearch(['s.description', 's.customer', 's.remarks'], q, where, params);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { page, pageSize, offset } = paging(q);

    const [rows] = await this.pool.query<RowDataPacket[]>(
      `${SELECT} ${clause} ORDER BY s.sale_date DESC, s.id DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );
    const [totals] = await this.pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total, COALESCE(SUM(s.amount), 0) AS sum FROM sales s ${clause}`,
      params,
    );
    return { rows, page, pageSize, total: Number(totals[0].total), sum: Number(totals[0].sum) };
  }

  async findOne(id: number) {
    const [rows] = await this.pool.query<RowDataPacket[]>(`${SELECT} WHERE s.id = ?`, [id]);
    if (!rows[0]) throw new NotFoundException(`Sale ${id} not found`);
    return rows[0];
  }

  async create(dto: UpsertSaleDto, userId: number) {
    const [result] = await this.pool.query<any>(
      `INSERT INTO sales (sale_date, customer, description, amount, remarks, created_by) VALUES (?, ?, ?, ?, ?, ?)`,
      [dto.saleDate, dto.customer?.trim() || null, dto.description.trim(), dto.amount, dto.remarks?.trim() || null, userId],
    );
    return this.findOne(result.insertId);
  }

  async update(id: number, dto: UpsertSaleDto) {
    await this.findOne(id);
    await this.pool.query(
      `UPDATE sales SET sale_date = ?, customer = ?, description = ?, amount = ?, remarks = ? WHERE id = ?`,
      [dto.saleDate, dto.customer?.trim() || null, dto.description.trim(), dto.amount, dto.remarks?.trim() || null, id],
    );
    return this.findOne(id);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.pool.query('DELETE FROM sales WHERE id = ?', [id]);
  }
}
