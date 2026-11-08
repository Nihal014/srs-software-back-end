import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import type { Item } from './item.interface.js';
import type { UpsertItemDto } from './dto/upsert-item.dto.js';
import type { Paged } from '../common/pagination.util.js';

type Paging = { page: number; pageSize: number; offset: number };

/**
 * The letters a code carries for an item's name, in the style the client already uses:
 * several words -> their first letters (Red chilli powder = RCP, Biriyani Masala = BM, up to three);
 * one word -> its first letter and its last consonant (Maida = MD, Salt = ST, Potato = PT).
 */
export function nameLetters(name: string): string {
  const words = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.slice(0, 3).map((w) => w[0]).join('');
  const word = words[0] ?? '';
  if (word.length <= 1) return word;
  const lastConsonant = [...word.slice(1)].reverse().find((ch) => !'AEIOU'.includes(ch) && /[A-Z]/.test(ch));
  return word[0] + (lastConsonant ?? word[1]);
}

@Injectable()
export class ItemsService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async findAll(): Promise<Item[]> {
    const [rows] = await this.pool.query<(Item & RowDataPacket)[]>(
      `SELECT i.*, c.name AS category_name, c.code AS category_code FROM items i LEFT JOIN item_categories c ON c.id = i.category_id WHERE i.is_active = 1 ORDER BY i.name`,
    );
    return rows;
  }

  /** With `paging` omitted, returns the plain array as before — the Bundle Recipes ingredient
   * dropdown needs every item, so it always calls this unpaginated. With `paging` set, returns
   * `{rows, total, page, pageSize}` for the paginated Items master screen. */
  async findAllForAdmin(): Promise<Item[]>;
  async findAllForAdmin(paging: Paging, search?: string): Promise<Paged<Item>>;
  async findAllForAdmin(paging?: Paging, search?: string): Promise<Item[] | Paged<Item>> {
    if (!paging) {
      const [rows] = await this.pool.query<(Item & RowDataPacket)[]>(`SELECT i.*, c.name AS category_name, c.code AS category_code FROM items i LEFT JOIN item_categories c ON c.id = i.category_id ORDER BY i.name`);
      return rows;
    }
    // Search matches the name or the code anywhere in the text (case-insensitive); % and _ typed by the user are taken literally.
    const term = search?.trim();
    const where = term ? 'WHERE i.name LIKE ? OR i.code LIKE ?' : '';
    const like = term ? `%${term.replace(/[\\%_]/g, (ch) => '\\' + ch)}%` : '';
    const whereParams = term ? [like, like] : [];
    const [countRows] = await this.pool.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM items i ${where}`, whereParams);
    const [rows] = await this.pool.query<(Item & RowDataPacket)[]>(
      `SELECT i.*, c.name AS category_name, c.code AS category_code FROM items i LEFT JOIN item_categories c ON c.id = i.category_id ${where} ORDER BY i.name LIMIT ? OFFSET ?`,
      [...whereParams, paging.pageSize, paging.offset],
    );
    return { rows, total: Number(countRows[0].total), page: paging.page, pageSize: paging.pageSize };
  }

  private async assertCategory(categoryId?: number | null) {
    if (categoryId === undefined || categoryId === null) return;
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT id FROM item_categories WHERE id = ?', [categoryId]);
    if (!rows.length) throw new BadRequestException(`Category ${categoryId} does not exist.`);
  }

  async findById(id: number): Promise<Item | null> {
    const [rows] = await this.pool.query<(Item & RowDataPacket)[]>(
      `SELECT i.*, c.name AS category_name, c.code AS category_code FROM items i LEFT JOIN item_categories c ON c.id = i.category_id WHERE i.id = ?`,
      [id],
    );
    return rows[0] ?? null;
  }

  /**
   * The next item code for a category and item name: the category's code, letters from the name and the next
   * number, e.g. ING-BM-00024. The number carries on from the highest number already used under the category's
   * prefix, whatever the letters (ING-MD-00023 -> ING-BM-00024).
   */
  private async nextCodeOn(conn: Pick<Pool | PoolConnection, 'query'>, categoryId: number, name?: string) {
    const [cats] = await conn.query<RowDataPacket[]>('SELECT name, code FROM item_categories WHERE id = ?', [categoryId]);
    const cat = cats[0];
    if (!cat) throw new BadRequestException(`Category ${categoryId} does not exist.`);
    const prefix = String(cat.code ?? '').trim().toUpperCase();
    if (!prefix) {
      throw new BadRequestException(`The category "${cat.name}" has no code yet. Add a short code to it (for example ING) so item codes can be generated.`);
    }
    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(code, '-', -1) AS UNSIGNED)), 0) AS last_number
         FROM items
        WHERE code LIKE ? AND SUBSTRING_INDEX(code, '-', -1) REGEXP '^[0-9]+$'`,
      [`${prefix}-%`],
    );
    const next = Number(rows[0].last_number) + 1;
    const letters = name ? nameLetters(name) : '';
    const number = String(next).padStart(5, '0');
    return { prefix, number: next, code: letters ? `${prefix}-${letters}-${number}` : `${prefix}-${number}` };
  }

  /** What the next item in this category will be called (shown in the form before saving). */
  async nextCode(categoryId: number, name?: string) {
    const { prefix, code } = await this.nextCodeOn(this.pool, categoryId, name?.trim());
    return { prefix, code };
  }

  async create(dto: UpsertItemDto): Promise<Item> {
    await this.assertCategory(dto.categoryId);
    if (!dto.code?.trim()) return this.createWithGeneratedCode(dto);
    const code = dto.code.trim().toUpperCase();
    try {
      const [result] = await this.pool.query<any>(
        `INSERT INTO items (code, name, unit, category_id, rate, reorder_level) VALUES (?, ?, ?, ?, ?, ?)`,
        [code, dto.name.trim(), dto.unit, dto.categoryId ?? null, dto.rate ?? 0, dto.reorderLevel],
      );
      return (await this.findById(result.insertId))!;
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        throw new ConflictException(`Item code "${code}" already exists.`);
      }
      throw err;
    }
  }

  /** Creates the item with the next code for its category. The category row is locked so two people saving at once get different numbers. */
  private async createWithGeneratedCode(dto: UpsertItemDto): Promise<Item> {
    if (!dto.categoryId) throw new BadRequestException('Enter an item code, or choose a category so the code can be generated.');
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query('SELECT id FROM item_categories WHERE id = ? FOR UPDATE', [dto.categoryId]);
      const { code } = await this.nextCodeOn(conn, dto.categoryId, dto.name.trim());
      const [result] = await conn.query<any>(
        `INSERT INTO items (code, name, unit, category_id, rate, reorder_level) VALUES (?, ?, ?, ?, ?, ?)`,
        [code, dto.name.trim(), dto.unit, dto.categoryId, dto.rate ?? 0, dto.reorderLevel],
      );
      await conn.commit();
      return (await this.findById(result.insertId))!;
    } catch (err: any) {
      await conn.rollback();
      if (err?.code === 'ER_DUP_ENTRY') throw new ConflictException('That item code was just taken. Please try again.');
      throw err;
    } finally {
      conn.release();
    }
  }

  // Deliberately never touches `rate` — see the DTO comment: rate is the
  // weighted-average maintained by GRN postings, not admin-editable.
  async update(id: number, dto: UpsertItemDto): Promise<Item> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException(`Item ${id} not found`);

    await this.assertCategory(dto.categoryId);
    // categoryId left out = keep the current category; null = clear it.
    const categoryId = dto.categoryId === undefined ? existing.category_id : dto.categoryId;
    const code = dto.code?.trim() ? dto.code.trim().toUpperCase() : existing.code;
    try {
      await this.pool.query(
        `UPDATE items SET code = ?, name = ?, unit = ?, category_id = ?, reorder_level = ?, is_active = ? WHERE id = ?`,
        [
          code,
          dto.name.trim(),
          dto.unit,
          categoryId,
          dto.reorderLevel,
          dto.isActive ?? existing.is_active,
          id,
        ],
      );
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        throw new ConflictException(`Item code "${code}" already exists.`);
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
