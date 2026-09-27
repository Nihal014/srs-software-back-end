import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import type { ItemCategory } from './item.interface.js';
import type { UpsertItemCategoryDto } from './dto/upsert-item-category.dto.js';

@Injectable()
export class ItemCategoriesService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  /** Active categories only (for pickers); pass `all` for the Master Data screen. */
  async findAll(all = false): Promise<ItemCategory[]> {
    const [rows] = await this.pool.query<(ItemCategory & RowDataPacket)[]>(
      `SELECT c.*, (SELECT COUNT(*) FROM items i WHERE i.category_id = c.id) AS item_count
         FROM item_categories c ${all ? '' : 'WHERE c.is_active = 1'} ORDER BY c.name`,
    );
    return rows;
  }

  async findById(id: number): Promise<ItemCategory | null> {
    const [rows] = await this.pool.query<(ItemCategory & RowDataPacket)[]>(
      `SELECT c.*, (SELECT COUNT(*) FROM items i WHERE i.category_id = c.id) AS item_count
         FROM item_categories c WHERE c.id = ?`,
      [id],
    );
    return rows[0] ?? null;
  }

  private normalize(dto: UpsertItemCategoryDto) {
    return { name: dto.name.trim(), code: dto.code?.trim() ? dto.code.trim().toUpperCase() : null };
  }

  private duplicate(err: any, dto: UpsertItemCategoryDto) {
    if (err?.code !== 'ER_DUP_ENTRY') return err;
    const which = /code/i.test(String(err.message)) ? `code "${dto.code?.trim().toUpperCase()}"` : `name "${dto.name.trim()}"`;
    return new ConflictException(`A category with ${which} already exists.`);
  }

  async create(dto: UpsertItemCategoryDto): Promise<ItemCategory> {
    const { name, code } = this.normalize(dto);
    try {
      const [result] = await this.pool.query<any>('INSERT INTO item_categories (name, code) VALUES (?, ?)', [name, code]);
      return (await this.findById(result.insertId))!;
    } catch (err) {
      throw this.duplicate(err, dto);
    }
  }

  async update(id: number, dto: UpsertItemCategoryDto): Promise<ItemCategory> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException(`Category ${id} not found`);
    const { name, code } = this.normalize(dto);
    try {
      await this.pool.query('UPDATE item_categories SET name = ?, code = ?, is_active = ? WHERE id = ?', [
        name,
        code,
        dto.isActive ?? existing.is_active,
        id,
      ]);
    } catch (err) {
      throw this.duplicate(err, dto);
    }
    return (await this.findById(id))!;
  }

  async remove(id: number): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException(`Category ${id} not found`);
    try {
      await this.pool.query('DELETE FROM item_categories WHERE id = ?', [id]);
    } catch (err: any) {
      if (err?.code === 'ER_ROW_IS_REFERENCED_2' || err?.code === 'ER_ROW_IS_REFERENCED') {
        throw new ConflictException(`"${existing.name}" is used by items and can't be deleted. Deactivate it instead.`);
      }
      throw err;
    }
  }
}
