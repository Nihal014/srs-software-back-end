import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import type { CreateReadyProductsDto, UpsertAccountDto, UpsertCategoryDto } from './dto/masters.dto.js';

const referenced = (err: any) => err?.code === 'ER_ROW_IS_REFERENCED_2' || err?.code === 'ER_ROW_IS_REFERENCED';
const duplicate = (err: any) => err?.code === 'ER_DUP_ENTRY';

@Injectable()
export class AccountsMasterService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  // ---------- expense categories ----------

  async listCategories(includeInactive: boolean) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT * FROM expense_categories ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY pl_group, name`,
    );
    return rows;
  }

  async createCategory(dto: UpsertCategoryDto) {
    try {
      const [result] = await this.pool.query<any>(
        'INSERT INTO expense_categories (name, pl_group, is_active) VALUES (?, ?, ?)',
        [dto.name.trim(), dto.plGroup, dto.isActive ?? true],
      );
      return this.getCategory(result.insertId);
    } catch (err) {
      if (duplicate(err)) throw new ConflictException(`Category "${dto.name.trim()}" already exists.`);
      throw err;
    }
  }

  async updateCategory(id: number, dto: UpsertCategoryDto) {
    const existing = await this.getCategory(id);
    try {
      await this.pool.query('UPDATE expense_categories SET name = ?, pl_group = ?, is_active = ? WHERE id = ?', [
        dto.name.trim(),
        dto.plGroup,
        dto.isActive ?? existing.is_active,
        id,
      ]);
    } catch (err) {
      if (duplicate(err)) throw new ConflictException(`Category "${dto.name.trim()}" already exists.`);
      throw err;
    }
    return this.getCategory(id);
  }

  async removeCategory(id: number) {
    const existing = await this.getCategory(id);
    try {
      await this.pool.query('DELETE FROM expense_categories WHERE id = ?', [id]);
    } catch (err) {
      if (referenced(err)) {
        throw new ConflictException(`"${existing.name}" has expenses recorded against it — deactivate it instead.`);
      }
      throw err;
    }
  }

  private async getCategory(id: number) {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT * FROM expense_categories WHERE id = ?', [id]);
    if (!rows[0]) throw new NotFoundException(`Category ${id} not found`);
    return rows[0];
  }

  // ---------- accounts (bank / cash / partner) ----------

  async listAccounts(includeInactive: boolean) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT a.*,
              a.opening_balance + COALESCE(r.total, 0) - COALESCE(e.total, 0) AS balance
         FROM accounts a
         LEFT JOIN (SELECT account_id, SUM(amount) AS total FROM receipts GROUP BY account_id) r ON r.account_id = a.id
         LEFT JOIN (SELECT account_id, SUM(amount) AS total FROM expenses GROUP BY account_id) e ON e.account_id = a.id
        ${includeInactive ? '' : 'WHERE a.is_active = 1'}
        ORDER BY a.account_type, a.name`,
    );
    return rows;
  }

  async createAccount(dto: UpsertAccountDto) {
    try {
      const [result] = await this.pool.query<any>(
        'INSERT INTO accounts (name, account_type, opening_balance, is_active) VALUES (?, ?, ?, ?)',
        [dto.name.trim(), dto.accountType, dto.openingBalance, dto.isActive ?? true],
      );
      return this.getAccount(result.insertId);
    } catch (err) {
      if (duplicate(err)) throw new ConflictException(`Account "${dto.name.trim()}" already exists.`);
      throw err;
    }
  }

  async updateAccount(id: number, dto: UpsertAccountDto) {
    const existing = await this.getAccount(id);
    try {
      await this.pool.query(
        'UPDATE accounts SET name = ?, account_type = ?, opening_balance = ?, is_active = ? WHERE id = ?',
        [dto.name.trim(), dto.accountType, dto.openingBalance, dto.isActive ?? existing.is_active, id],
      );
    } catch (err) {
      if (duplicate(err)) throw new ConflictException(`Account "${dto.name.trim()}" already exists.`);
      throw err;
    }
    return this.getAccount(id);
  }

  async removeAccount(id: number) {
    const existing = await this.getAccount(id);
    try {
      await this.pool.query('DELETE FROM accounts WHERE id = ?', [id]);
    } catch (err) {
      if (referenced(err)) {
        throw new ConflictException(`"${existing.name}" has transactions recorded against it — deactivate it instead.`);
      }
      throw err;
    }
  }

  private async getAccount(id: number) {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT * FROM accounts WHERE id = ?', [id]);
    if (!rows[0]) throw new NotFoundException(`Account ${id} not found`);
    return rows[0];
  }

  // ---------- ready products (unsold finished-goods value) ----------

  async listReadyProducts() {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT id, DATE_FORMAT(as_of_date, '%Y-%m-%d') AS as_of_date, amount, remarks
         FROM ready_products ORDER BY as_of_date DESC, id DESC LIMIT 50`,
    );
    return rows;
  }

  async createReadyProducts(dto: CreateReadyProductsDto) {
    await this.pool.query('INSERT INTO ready_products (as_of_date, amount, remarks) VALUES (?, ?, ?)', [
      dto.asOfDate,
      dto.amount,
      dto.remarks?.trim() || null,
    ]);
    return this.listReadyProducts();
  }

  async removeReadyProducts(id: number) {
    await this.pool.query('DELETE FROM ready_products WHERE id = ?', [id]);
    return this.listReadyProducts();
  }
}
