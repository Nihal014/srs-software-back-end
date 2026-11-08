import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import type { DeliveryLocation } from './delivery-location.interface.js';
import type { UpsertDeliveryLocationDto } from './dto/upsert-delivery-location.dto.js';

@Injectable()
export class DeliveryLocationsService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async findAll(): Promise<DeliveryLocation[]> {
    const [rows] = await this.pool.query<(DeliveryLocation & RowDataPacket)[]>(
      'SELECT * FROM delivery_locations WHERE is_active = 1 ORDER BY name',
    );
    return rows;
  }

  async findAllForAdmin(): Promise<DeliveryLocation[]> {
    const [rows] = await this.pool.query<(DeliveryLocation & RowDataPacket)[]>(
      'SELECT * FROM delivery_locations ORDER BY name',
    );
    return rows;
  }

  async create(dto: UpsertDeliveryLocationDto): Promise<DeliveryLocation> {
    try {
      const [result] = await this.pool.query<any>(
        'INSERT INTO delivery_locations (name, is_production) VALUES (?, ?)',
        [dto.name.trim(), dto.isProduction ?? false],
      );
      return { id: result.insertId, name: dto.name.trim(), is_active: true, is_production: dto.isProduction ?? false };
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        throw new ConflictException(`A delivery location named "${dto.name.trim()}" already exists.`);
      }
      throw err;
    }
  }

  async update(id: number, dto: UpsertDeliveryLocationDto): Promise<DeliveryLocation> {
    const [existing] = await this.pool.query<RowDataPacket[]>(
      'SELECT id FROM delivery_locations WHERE id = ?',
      [id],
    );
    if (!existing[0]) throw new NotFoundException(`Delivery location ${id} not found`);

    try {
      await this.pool.query('UPDATE delivery_locations SET name = ?, is_active = ?, is_production = ? WHERE id = ?', [
        dto.name.trim(),
        dto.isActive ?? true,
        dto.isProduction ?? false,
        id,
      ]);
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') {
        throw new ConflictException(`A delivery location named "${dto.name.trim()}" already exists.`);
      }
      throw err;
    }
    const [rows] = await this.pool.query<(DeliveryLocation & RowDataPacket)[]>(
      'SELECT * FROM delivery_locations WHERE id = ?',
      [id],
    );
    return rows[0];
  }

  // Purchase orders only store the name as text, but stock batches and transfers reference the location.
  async remove(id: number): Promise<void> {
    try {
      const [result] = await this.pool.query<any>('DELETE FROM delivery_locations WHERE id = ?', [id]);
      if (result.affectedRows === 0) throw new NotFoundException(`Delivery location ${id} not found`);
    } catch (err: any) {
      if (err?.code === 'ER_ROW_IS_REFERENCED_2' || err?.code === 'ER_ROW_IS_REFERENCED') {
        throw new ConflictException('This location holds stock or has transfers, so it can\'t be deleted. Deactivate it instead.');
      }
      throw err;
    }
  }
}
