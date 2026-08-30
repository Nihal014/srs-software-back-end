import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import type { Supplier } from './supplier.interface.js';
import type { UpsertSupplierDto } from './dto/upsert-supplier.dto.js';

@Injectable()
export class SuppliersService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async findAll(): Promise<Supplier[]> {
    const [rows] = await this.pool.query<(Supplier & RowDataPacket)[]>(
      'SELECT * FROM suppliers WHERE is_active = 1 ORDER BY name',
    );
    return rows;
  }

  async findAllForAdmin(): Promise<Supplier[]> {
    const [rows] = await this.pool.query<(Supplier & RowDataPacket)[]>(
      'SELECT * FROM suppliers ORDER BY name',
    );
    return rows;
  }

  async findById(id: number): Promise<Supplier | null> {
    const [rows] = await this.pool.query<(Supplier & RowDataPacket)[]>(
      'SELECT * FROM suppliers WHERE id = ?',
      [id],
    );
    return rows[0] ?? null;
  }

  async create(dto: UpsertSupplierDto): Promise<Supplier> {
    try {
      const [result] = await this.pool.query<any>(
        `INSERT INTO suppliers (name, contact_person, phone, email, address, gstin, pan, payment_terms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dto.name.trim(),
          dto.contactPerson ?? null,
          dto.phone ?? null,
          dto.email ?? null,
          dto.address ?? null,
          dto.gstin ?? null,
          dto.pan ?? null,
          dto.paymentTerms ?? 'Net 15 days',
        ],
      );
      return (await this.findById(result.insertId))!;
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        throw new ConflictException(`A supplier named "${dto.name.trim()}" already exists.`);
      }
      throw err;
    }
  }

  async update(id: number, dto: UpsertSupplierDto): Promise<Supplier> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException(`Supplier ${id} not found`);

    await this.pool.query(
      `UPDATE suppliers SET name = ?, contact_person = ?, phone = ?, email = ?, address = ?,
              gstin = ?, pan = ?, payment_terms = ?, is_active = ?
        WHERE id = ?`,
      [
        dto.name.trim(),
        dto.contactPerson ?? null,
        dto.phone ?? null,
        dto.email ?? null,
        dto.address ?? null,
        dto.gstin ?? null,
        dto.pan ?? null,
        dto.paymentTerms ?? existing.payment_terms,
        dto.isActive ?? existing.is_active,
        id,
      ],
    );
    return (await this.findById(id))!;
  }

  async remove(id: number): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException(`Supplier ${id} not found`);
    try {
      await this.pool.query('DELETE FROM suppliers WHERE id = ?', [id]);
    } catch (err: any) {
      if (err?.code === 'ER_ROW_IS_REFERENCED_2' || err?.code === 'ER_ROW_IS_REFERENCED') {
        throw new ConflictException(
          `"${existing.name}" has purchase order history and can't be deleted — deactivate it instead.`,
        );
      }
      throw err;
    }
  }
}
