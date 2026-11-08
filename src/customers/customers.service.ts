import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import { RECEIPT_SOURCE } from '../accounts/accounts.interface.js';
import type { UpsertCustomerDto } from './dto/upsert-customer.dto.js';

// Totals are derived: what the customer was sold, what they paid (receipts of type "customer payment"
// linked to them), and the difference. Receipts not linked to a customer are not counted here.
const SELECT = `
  SELECT c.*,
         COALESCE((SELECT SUM(s.amount) FROM sales s WHERE s.customer_id = c.id), 0) AS total_sales,
         COALESCE((SELECT SUM(r.amount) FROM receipts r WHERE r.customer_id = c.id AND r.source = ${RECEIPT_SOURCE.SalesPayment}), 0) AS total_received
    FROM customers c`;

function withOutstanding(row: RowDataPacket): Record<string, any> {
  const outstanding = Math.round((Number(row.total_sales) - Number(row.total_received)) * 100) / 100;
  const limit = row.credit_limit === null ? null : Number(row.credit_limit);
  return { ...row, outstanding, over_limit: limit !== null && outstanding > limit };
}

@Injectable()
export class CustomersService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async findAll(includeInactive: boolean) {
    const [rows] = await this.pool.query<RowDataPacket[]>(`${SELECT} ${includeInactive ? '' : 'WHERE c.is_active = 1'} ORDER BY c.name`);
    return rows.map(withOutstanding);
  }

  async findById(id: number) {
    const [rows] = await this.pool.query<RowDataPacket[]>(`${SELECT} WHERE c.id = ?`, [id]);
    return rows[0] ? withOutstanding(rows[0]) : null;
  }

  private values(dto: UpsertCustomerDto) {
    return [
      dto.name.trim(),
      dto.contactPerson?.trim() || null,
      dto.phone?.trim() || null,
      dto.email?.trim() || null,
      dto.address?.trim() || null,
      dto.gstin?.trim() || null,
      dto.paymentTerms ?? 'Net 15 days',
      dto.creditLimit ?? null,
    ];
  }

  async create(dto: UpsertCustomerDto) {
    try {
      const [result] = await this.pool.query<any>(
        `INSERT INTO customers (name, contact_person, phone, email, address, gstin, payment_terms, credit_limit)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        this.values(dto),
      );
      return (await this.findById(result.insertId))!;
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') throw new ConflictException(`A customer named "${dto.name.trim()}" already exists.`);
      throw err;
    }
  }

  async update(id: number, dto: UpsertCustomerDto) {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException(`Customer ${id} not found`);
    try {
      await this.pool.query(
        `UPDATE customers SET name = ?, contact_person = ?, phone = ?, email = ?, address = ?, gstin = ?,
                payment_terms = ?, credit_limit = ?, is_active = ?
          WHERE id = ?`,
        [...this.values(dto), dto.isActive ?? existing.is_active, id],
      );
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') throw new ConflictException(`A customer named "${dto.name.trim()}" already exists.`);
      throw err;
    }
    return (await this.findById(id))!;
  }

  async remove(id: number) {
    const existing = await this.findById(id);
    if (!existing) throw new NotFoundException(`Customer ${id} not found`);
    try {
      await this.pool.query('DELETE FROM customers WHERE id = ?', [id]);
    } catch (err: any) {
      if (err?.code === 'ER_ROW_IS_REFERENCED_2' || err?.code === 'ER_ROW_IS_REFERENCED') {
        throw new ConflictException(`"${existing.name}" has sales or payments recorded and can't be deleted. Deactivate it instead.`);
      }
      throw err;
    }
  }
}
