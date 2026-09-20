import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import { PAY_TYPE, type DayEntryRow, type DaySheet, type PayType } from './payroll.interface.js';
import type { SaveDayDto } from './dto/save-day.dto.js';

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class PayrollService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  /** Every active staff member for the date, with their entry if one exists (inactive staff only if they have one). */
  async getDay(date: string): Promise<DaySheet> {
    const [rows] = await this.pool.query<(DayEntryRow & RowDataPacket)[]>(
      `SELECT s.id AS staff_id, s.name, s.pay_type, s.pay_rate,
              e.id AS entry_id, e.hours, e.amount
         FROM staff s
         LEFT JOIN attendance_entries e ON e.staff_id = s.id AND e.work_date = ?
        WHERE s.is_active = 1 OR e.id IS NOT NULL
        ORDER BY s.name`,
      [date],
    );
    const worked = rows.filter((r) => r.entry_id !== null);
    return {
      date,
      rows,
      total: round2(worked.reduce((a, r) => a + Number(r.amount), 0)),
      staffCount: worked.length,
    };
  }

  async saveDay(dto: SaveDayDto, userId: number): Promise<DaySheet> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      for (const line of dto.lines) {
        const [staffRows] = await conn.query<RowDataPacket[]>('SELECT id, name, pay_type, pay_rate FROM staff WHERE id = ?', [
          line.staffId,
        ]);
        const staff = staffRows[0];
        if (!staff) throw new NotFoundException(`Staff ${line.staffId} not found`);

        if (!line.present) {
          await conn.query('DELETE FROM attendance_entries WHERE staff_id = ? AND work_date = ?', [line.staffId, dto.date]);
          continue;
        }

        let amount: number;
        if (line.amount !== undefined) {
          amount = round2(line.amount);
        } else if ((staff.pay_type as PayType) === PAY_TYPE.Hourly) {
          if (!line.hours || line.hours <= 0) {
            throw new BadRequestException(`${staff.name}: enter the hours worked.`);
          }
          amount = round2(line.hours * Number(staff.pay_rate));
        } else {
          amount = round2(Number(staff.pay_rate));
        }

        await conn.query(
          `INSERT INTO attendance_entries (staff_id, work_date, hours, amount, remarks, created_by)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE hours = VALUES(hours), amount = VALUES(amount), remarks = VALUES(remarks)`,
          [line.staffId, dto.date, line.hours ?? null, amount, line.remarks?.trim() || null, userId],
        );
      }

      await conn.commit();
      return this.getDay(dto.date);
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  /** Staff x day grid for one month (the client's "Staff Attendance & Salary" sheet). */
  async getMonth(month: string) {
    const [y, m] = this.parseMonth(month);
    const daysInMonth = new Date(y, m, 0).getDate();
    const first = `${month}-01`;
    const last = `${month}-${String(daysInMonth).padStart(2, '0')}`;

    const [entries] = await this.pool.query<RowDataPacket[]>(
      `SELECT staff_id, DAY(work_date) AS day, amount FROM attendance_entries WHERE work_date BETWEEN ? AND ?`,
      [first, last],
    );
    const [staffRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT s.id, s.name FROM staff s
        WHERE s.is_active = 1
           OR s.id IN (SELECT staff_id FROM attendance_entries WHERE work_date BETWEEN ? AND ?)
        ORDER BY s.name`,
      [first, last],
    );

    const dayTotals: Record<number, number> = {};
    const byStaff = new Map<number, Record<number, number>>();
    for (const e of entries) {
      const amounts = byStaff.get(e.staff_id) ?? {};
      amounts[e.day] = Number(e.amount);
      byStaff.set(e.staff_id, amounts);
      dayTotals[e.day] = round2((dayTotals[e.day] ?? 0) + Number(e.amount));
    }

    const staff = staffRows.map((s) => {
      const amounts = byStaff.get(s.id) ?? {};
      return {
        staffId: s.id as number,
        name: s.name as string,
        amounts,
        total: round2(Object.values(amounts).reduce((a, v) => a + v, 0)),
      };
    });
    return { month, daysInMonth, staff, dayTotals, grandTotal: round2(staff.reduce((a, s) => a + s.total, 0)) };
  }

  /** Staff x month totals for a year (the client's "2026 Total Salary" sheet). */
  async getYear(year: number) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT staff_id, MONTH(work_date) AS month, SUM(amount) AS total
         FROM attendance_entries WHERE YEAR(work_date) = ? GROUP BY staff_id, MONTH(work_date)`,
      [year],
    );
    const [staffRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT s.id, s.name FROM staff s
        WHERE s.is_active = 1 OR s.id IN (SELECT staff_id FROM attendance_entries WHERE YEAR(work_date) = ?)
        ORDER BY s.name`,
      [year],
    );

    const byStaff = new Map<number, number[]>();
    const monthTotals = Array<number>(12).fill(0);
    for (const r of rows) {
      const months = byStaff.get(r.staff_id) ?? Array<number>(12).fill(0);
      months[r.month - 1] = round2(Number(r.total));
      byStaff.set(r.staff_id, months);
      monthTotals[r.month - 1] = round2(monthTotals[r.month - 1] + Number(r.total));
    }
    const staff = staffRows.map((s) => {
      const months = byStaff.get(s.id) ?? Array<number>(12).fill(0);
      return { staffId: s.id as number, name: s.name as string, months, total: round2(months.reduce((a, v) => a + v, 0)) };
    });
    return { year, staff, monthTotals, grandTotal: round2(staff.reduce((a, s) => a + s.total, 0)) };
  }

  /** Total wages earned on a date, used to suggest a production run's labor cost. */
  async getDayTotal(date: string) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      'SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS staffCount FROM attendance_entries WHERE work_date = ?',
      [date],
    );
    return { date, total: round2(Number(rows[0].total)), staffCount: Number(rows[0].staffCount) };
  }

  private parseMonth(month: string): [number, number] {
    const match = /^(\d{4})-(\d{2})$/.exec(month);
    const m = match ? Number(match[2]) : 0;
    if (!match || m < 1 || m > 12) throw new BadRequestException('month must be YYYY-MM');
    return [Number(match[1]), m];
  }
}
