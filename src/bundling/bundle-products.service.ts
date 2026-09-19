import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import type { BundleProduct, BundleProductDetail } from './bundle.interface.js';
import type { UpsertBundleProductDto } from './dto/upsert-bundle-product.dto.js';

@Injectable()
export class BundleProductsService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async findAll(): Promise<BundleProduct[]> {
    const [rows] = await this.pool.query<(BundleProduct & RowDataPacket)[]>(
      'SELECT * FROM bundle_products WHERE is_active = 1 ORDER BY name',
    );
    return rows;
  }

  async findAllForAdmin(): Promise<BundleProduct[]> {
    const [rows] = await this.pool.query<(BundleProduct & RowDataPacket)[]>(
      'SELECT * FROM bundle_products ORDER BY name',
    );
    return rows;
  }

  async findById(id: number): Promise<BundleProductDetail | null> {
    const [rows] = await this.pool.query<(BundleProduct & RowDataPacket)[]>(
      'SELECT * FROM bundle_products WHERE id = ?',
      [id],
    );
    const product = rows[0];
    if (!product) return null;

    const [bomLines] = await this.pool.query<RowDataPacket[]>(
      `SELECT bl.id, bl.bundle_product_id, bl.item_id, i.code AS item_code, i.name AS item_name,
              i.unit, bl.qty_per_unit
         FROM bundle_bom_lines bl
         JOIN items i ON i.id = bl.item_id
        WHERE bl.bundle_product_id = ?
        ORDER BY i.name`,
      [id],
    );
    return { ...product, bomLines: bomLines as any };
  }

  async create(dto: UpsertBundleProductDto): Promise<BundleProductDetail> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      let result: any;
      try {
        [result] = await conn.query<any>(
          `INSERT INTO bundle_products (code, name, output_unit, selling_price, is_active)
           VALUES (?, ?, ?, ?, ?)`,
          [dto.code.trim().toUpperCase(), dto.name.trim(), dto.outputUnit, dto.sellingPrice, dto.isActive ?? true],
        );
      } catch (err: any) {
        if (err?.code === 'ER_DUP_ENTRY') {
          throw new ConflictException(`Bundle code "${dto.code.trim().toUpperCase()}" already exists.`);
        }
        throw err;
      }
      const bundleId = result.insertId;

      for (const line of dto.bomLines) {
        await conn.query(
          `INSERT INTO bundle_bom_lines (bundle_product_id, item_id, qty_per_unit) VALUES (?, ?, ?)`,
          [bundleId, line.itemId, line.qtyPerUnit],
        );
      }

      await conn.commit();
      return (await this.findById(bundleId))!;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async update(id: number, dto: UpsertBundleProductDto): Promise<BundleProductDetail> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException(`Bundle product ${id} not found`);

    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      try {
        await conn.query(
          `UPDATE bundle_products SET code = ?, name = ?, output_unit = ?, selling_price = ?, is_active = ? WHERE id = ?`,
          [
            dto.code.trim().toUpperCase(),
            dto.name.trim(),
            dto.outputUnit,
            dto.sellingPrice,
            dto.isActive ?? existing.is_active,
            id,
          ],
        );
      } catch (err: any) {
        if (err?.code === 'ER_DUP_ENTRY') {
          throw new ConflictException(`Bundle code "${dto.code.trim().toUpperCase()}" already exists.`);
        }
        throw err;
      }

      await conn.query('DELETE FROM bundle_bom_lines WHERE bundle_product_id = ?', [id]);
      for (const line of dto.bomLines) {
        await conn.query(
          `INSERT INTO bundle_bom_lines (bundle_product_id, item_id, qty_per_unit) VALUES (?, ?, ?)`,
          [id, line.itemId, line.qtyPerUnit],
        );
      }

      await conn.commit();
      return (await this.findById(id))!;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  async remove(id: number): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException(`Bundle product ${id} not found`);
    try {
      await this.pool.query('DELETE FROM bundle_products WHERE id = ?', [id]);
    } catch (err: any) {
      if (err?.code === 'ER_ROW_IS_REFERENCED_2' || err?.code === 'ER_ROW_IS_REFERENCED') {
        throw new ConflictException(
          `"${existing.name}" has production history and can't be deleted — deactivate it instead.`,
        );
      }
      throw err;
    }
  }
}
