import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import type { Item } from './item.interface.js';
import type { UpsertItemDto } from './dto/upsert-item.dto.js';

@Injectable()
export class ItemsService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async findAll(): Promise<Item[]> {
    const [rows] = await this.pool.query<(Item & RowDataPacket)[]>(
      'SELECT * FROM items WHERE is_active = 1 ORDER BY name',
    );
    return rows;
  }

  async findAllForAdmin(): Promise<Item[]> {
    const [rows] = await this.pool.query<(Item & RowDataPacket)[]>(
      'SELECT * FROM items ORDER BY name',
    );
    return rows;
  }

  async findById(id: number): Promise<Item | null> {
    const [rows] = await this.pool.query<(Item & RowDataPacket)[]>(
      'SELECT * FROM items WHERE id = ?',
      [id],
    );
    return rows[0] ?? null;
  }

  async create(dto: UpsertItemDto): Promise<Item> {
    try {
      const [result] = await this.pool.query<any>(
        `INSERT INTO items (code, name, unit, rate, reorder_level) VALUES (?, ?, ?, ?, ?)`,
        [dto.code.trim().toUpperCase(), dto.name.trim(), dto.unit, dto.rate ?? 0, dto.reorderLevel],
      );
      return (await this.findById(result.insertId))!;
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        throw new ConflictException(`Item code "${dto.code.trim().toUpperCase()}" already exists.`);
      }
      throw err;
    }
  }

  // Deliberately never touches `rate` — see the DTO comment: rate is the
  // weighted-average maintained by GRN postings, not admin-editable.
  async update(id: number, dto: UpsertItemDto): Promise<Item> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException(`Item ${id} not found`);

    try {
      await this.pool.query(
        `UPDATE items SET code = ?, name = ?, unit = ?, reorder_level = ?, is_active = ? WHERE id = ?`,
        [
          dto.code.trim().toUpperCase(),
          dto.name.trim(),
          dto.unit,
          dto.reorderLevel,
          dto.isActive ?? existing.is_active,
          id,
        ],
      );
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        throw new ConflictException(`Item code "${dto.code.trim().toUpperCase()}" already exists.`);
      }
      throw err;
    }
    return (await this.findById(id))!;
  }

  async remove(id: number): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException(`Item ${id} not found`);
    try {
      await this.pool.query('DELETE FROM items WHERE id = ?', [id]);
    } catch (err: any) {
      if (err?.code === 'ER_ROW_IS_REFERENCED_2' || err?.code === 'ER_ROW_IS_REFERENCED') {
        throw new ConflictException(
          `"${existing.name}" has purchase order or batch history and can't be deleted — deactivate it instead.`,
        );
      }
      throw err;
    }
  }

  /**
   * Weighted-average rate on receipt: the item's `rate` becomes
   * (prior total value + this receipt's value) / (prior qty + this qty),
   * never a flat overwrite. Runs inside the caller's GRN-post transaction.
   */
  async applyWeightedAverageReceipt(
    conn: PoolConnection,
    itemId: number,
    priorQty: number,
    qtyReceived: number,
    receiptRate: number,
  ): Promise<void> {
    const [rows] = await conn.query<(Item & RowDataPacket)[]>(
      'SELECT rate FROM items WHERE id = ? FOR UPDATE',
      [itemId],
    );
    const currentRate = rows[0]?.rate ?? receiptRate;
    const totalQty = priorQty + qtyReceived;
    const newRate =
      totalQty > 0
        ? (priorQty * currentRate + qtyReceived * receiptRate) / totalQty
        : receiptRate;
    await conn.query('UPDATE items SET rate = ? WHERE id = ?', [
      Math.round(newRate * 100) / 100,
      itemId,
    ]);
  }
}
