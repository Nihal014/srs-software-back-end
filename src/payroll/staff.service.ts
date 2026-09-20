import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import type { Staff } from './payroll.interface.js';
import type { UpsertStaffDto } from './dto/upsert-staff.dto.js';

@Injectable()
export class StaffService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async findAll(includeInactive: boolean): Promise<Staff[]> {
    const [rows] = await this.pool.query<(Staff & RowDataPacket)[]>(
      `SELECT * FROM staff ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY name`,
    );
    return rows;
  }

  async findById(id: number): Promise<Staff | null> {
    const [rows] = await this.pool.query<(Staff & RowDataPacket)[]>('SELECT * FROM staff WHERE id = ?', [id]);
    return rows[0] ?? null;
  }

  async create(dto: UpsertStaffDto): Promise<Staff> {
    const [result] = await this.pool.query<any>(
      'INSERT INTO staff (name, phone, pay_type, pay_rate, is_active) VALUES (?, ?, ?, ?, ?)',
      [dto.name.trim(), dto.phone?.trim() || null, dto.payType, dto.payRate, dto.isActive ?? true],
    );
    return (await this.findById(result.insertId))!;
  }

  // Changing the rate only affects future entries: past days keep the amount they were saved with.
  async update(id: number, dto: UpsertStaffDto): Promise<Staff> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException(`Staff ${id} not found`);
    await this.pool.query(
      'UPDATE staff SET name = ?, phone = ?, pay_type = ?, pay_rate = ?, is_active = ? WHERE id = ?',
      [dto.name.trim(), dto.phone?.trim() || null, dto.payType, dto.payRate, dto.isActive ?? existing.is_active, id],
    );
    return (await this.findById(id))!;
  }

  async remove(id: number): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException(`Staff ${id} not found`);
    try {
      await this.pool.query('DELETE FROM staff WHERE id = ?', [id]);
    } catch (err: any) {
      if (err?.code === 'ER_ROW_IS_REFERENCED_2' || err?.code === 'ER_ROW_IS_REFERENCED') {
        throw new ConflictException(`"${existing.name}" has attendance history and can't be deleted — deactivate instead.`);
      }
      throw err;
    }
  }
}
