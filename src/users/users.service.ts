import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import { USER_ROLE, USER_STATUS, type PublicUser, type UserRole, type UserRow } from './user.interface.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';

const SELECT_COLUMNS = 'id, email, name, password_hash, role, status, is_active';
const PUBLIC_COLUMNS = 'id, email, name, role, status, is_active';

@Injectable()
export class UsersService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async findByEmail(email: string): Promise<UserRow | null> {
    const [rows] = await this.pool.query<(UserRow & RowDataPacket)[]>(
      `SELECT ${SELECT_COLUMNS} FROM users WHERE email = ? AND is_active = 1`,
      [email],
    );
    return rows[0] ?? null;
  }

  async findById(id: number): Promise<PublicUser | null> {
    const [rows] = await this.pool.query<(PublicUser & RowDataPacket)[]>(
      `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ? AND is_active = 1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async findAll(): Promise<PublicUser[]> {
    const [rows] = await this.pool.query<(PublicUser & RowDataPacket)[]>(
      `SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY status ASC, created_at DESC`,
    );
    return rows;
  }

  async signup(name: string, email: string, password: string): Promise<PublicUser> {
    const existing = await this.pool.query<RowDataPacket[]>('SELECT id FROM users WHERE email = ?', [email]);
    if (existing[0].length > 0) {
      throw new ConflictException('An account with this email already exists.');
    }
    const passwordHash = await bcrypt.hash(password, 12);
    const [result] = await this.pool.query<any>(
      'INSERT INTO users (email, name, password_hash, role, status) VALUES (?, ?, ?, ?, ?)',
      [email, name, passwordHash, USER_ROLE.Staff, USER_STATUS.Pending],
    );
    const created = await this.findById(result.insertId);
    if (!created) throw new NotFoundException('User not found after creation.');
    return created;
  }

  async approve(id: number, role?: UserRole): Promise<PublicUser> {
    const user = await this.mustFind(id);
    const nextRole = role ?? user.role;
    await this.pool.query('UPDATE users SET status = ?, role = ? WHERE id = ?', [
      USER_STATUS.Approved,
      nextRole,
      id,
    ]);
    return (await this.findById(id))!;
  }

  async reject(id: number): Promise<PublicUser> {
    await this.mustFind(id);
    await this.pool.query('UPDATE users SET status = ? WHERE id = ?', [USER_STATUS.Rejected, id]);
    return (await this.findById(id))!;
  }

  async update(id: number, dto: UpdateUserDto): Promise<PublicUser> {
    await this.mustFind(id);
    const sets: string[] = [];
    const params: unknown[] = [];
    if (dto.role !== undefined) {
      sets.push('role = ?');
      params.push(dto.role);
    }
    if (dto.isActive !== undefined) {
      sets.push('is_active = ?');
      params.push(dto.isActive ? 1 : 0);
    }
    if (sets.length > 0) {
      params.push(id);
      await this.pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
    }
    return (await this.findById(id))!;
  }

  toPublic(user: UserRow): PublicUser {
    const { password_hash: _password_hash, ...publicUser } = user;
    return publicUser;
  }

  private async mustFind(id: number): Promise<PublicUser> {
    const [rows] = await this.pool.query<(PublicUser & RowDataPacket)[]>(
      `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('User not found.');
    return rows[0];
  }
}
