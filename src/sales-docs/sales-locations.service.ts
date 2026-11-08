import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import type { UpsertSalesLocationDto } from './dto/sales-docs.dto.js';

@Injectable()
export class SalesLocationsService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async findAll(includeInactive: boolean) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT * FROM sales_locations ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY name`,
    );
    return rows;
  }

  private async findById(id: number) {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT * FROM sales_locations WHERE id = ?', [id]);
    return rows[0] ?? null;
  }

  async create(dto: UpsertSalesLocationDto) {
    try {
      const [result] = await this.pool.query<any>('INSERT INTO sales_locations (name, address) VALUES (?, ?)', [
        dto.name.trim(),
        dto.address?.trim() || null,
      ]);
      return (await this.findById(result.insertId))!;
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') throw new ConflictException(`A sales location named "${dto.name.trim()}" already exists.`);
      throw err;
    }
  }

  async update(id: number, dto: UpsertSalesLocationDto) {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException(`Sales location ${id} not found`);
    try {
      await this.pool.query('UPDATE sales_locations SET name = ?, address = ?, is_active = ? WHERE id = ?', [
        dto.name.trim(),
        dto.address?.trim() || null,
        dto.isActive ?? existing.is_active,
        id,
      ]);
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') throw new ConflictException(`A sales location named "${dto.name.trim()}" already exists.`);
      throw err;
    }
    return (await this.findById(id))!;
  }

  async remove(id: number) {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException(`Sales location ${id} not found`);
    try {
      await this.pool.query('DELETE FROM sales_locations WHERE id = ?', [id]);
    } catch (err: any) {
      if (err?.code === 'ER_ROW_IS_REFERENCED_2' || err?.code === 'ER_ROW_IS_REFERENCED') {
        throw new ConflictException(`"${existing.name}" is used on sales documents and can't be deleted. Deactivate it instead.`);
      }
      throw err;
    }
  }
}
