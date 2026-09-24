import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import { BundleProductsService } from './bundle-products.service.js';
import type { BundleProduction, RequirementLine } from './bundle.interface.js';
import type { CreateProductionDto } from './dto/create-production.dto.js';
import type { Paged } from '../common/pagination.util.js';

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

interface AvailableBatch extends RowDataPacket {
  id: number;
  qty_available: number;
  rate: number;
}

@Injectable()
export class BundleProductionsService {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly bundleProducts: BundleProductsService,
  ) {}

  /** For the "how much can I make" preview: required vs available per ingredient, no writes. */
  async checkRequirement(bundleProductId: number, qty: number): Promise<RequirementLine[]> {
    const bundle = await this.bundleProducts.findById(bundleProductId);
    if (!bundle) throw new NotFoundException(`Bundle product ${bundleProductId} not found`);

    const lines: RequirementLine[] = [];
    for (const bom of bundle.bomLines) {
      const required = Math.round(bom.qty_per_unit * qty * 1000) / 1000;
      // Expired batches (expiry before today, same rule as days_to_expiry) are never usable.
      const [rows] = await this.pool.query<RowDataPacket[]>(
        `SELECT COALESCE(SUM(CASE WHEN expiry_date >= CURDATE() THEN qty_received - qty_consumed + qty_adjusted END), 0) AS available,
                COALESCE(SUM(CASE WHEN expiry_date < CURDATE() THEN qty_received - qty_consumed + qty_adjusted END), 0) AS expired
           FROM batches WHERE item_id = ? AND is_quarantined = 0`,
        [bom.item_id],
      );
      const available = Number(rows[0].available);
      lines.push({
        itemId: bom.item_id,
        itemCode: bom.item_code,
        itemName: bom.item_name,
        unit: bom.unit,
        required,
        available,
        expired: Math.max(0, Number(rows[0].expired)),
        shortage: Math.max(0, Math.round((required - available) * 1000) / 1000),
      });
    }
    return lines;
  }

  /** With `paging` omitted, returns the plain array as before; with `paging` set, returns
   * `{rows, total, page, pageSize}` for the paginated production list screen. */
  async findAll(): Promise<any[]>;
  async findAll(paging: { page: number; pageSize: number; offset: number }): Promise<Paged<any>>;
  async findAll(paging?: { page: number; pageSize: number; offset: number }) {
    let total: number | null = null;
    if (paging) {
      const [countRows] = await this.pool.query<RowDataPacket[]>('SELECT COUNT(*) AS total FROM bundle_productions');
      total = Number(countRows[0].total);
    }
    const limitClause = paging ? 'LIMIT ? OFFSET ?' : '';
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT bp.*, b.code AS bundle_code, b.name AS bundle_name
         FROM bundle_productions bp
         JOIN bundle_products b ON b.id = bp.bundle_product_id
        ORDER BY bp.produced_date DESC, bp.id DESC
        ${limitClause}`,
      paging ? [paging.pageSize, paging.offset] : [],
    );
    return paging ? { rows, total: total!, page: paging.page, pageSize: paging.pageSize } : rows;
  }

  async findOne(id: number) {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT bp.*, b.code AS bundle_code, b.name AS bundle_name, b.output_unit
         FROM bundle_productions bp
         JOIN bundle_products b ON b.id = bp.bundle_product_id
        WHERE bp.id = ?`,
      [id],
    );
    const production = rows[0];
    if (!production) throw new NotFoundException(`Production ${id} not found`);

    const [consumptions] = await this.pool.query<RowDataPacket[]>(
      `SELECT bc.*, i.name AS item_name, bt.batch_number,
              g.id AS grn_id, g.grn_number, po.id AS purchase_order_id, po.po_number, s.name AS supplier_name
         FROM bundle_consumptions bc
         JOIN items i ON i.id = bc.item_id
         JOIN batches bt ON bt.id = bc.batch_id
         JOIN grn_lines gl ON gl.id = bt.grn_line_id
         JOIN grns g ON g.id = gl.grn_id
         JOIN purchase_orders po ON po.id = g.purchase_order_id
         JOIN suppliers s ON s.id = po.supplier_id
        WHERE bc.production_id = ?
        ORDER BY i.name`,
      [id],
    );
    return { ...production, consumptions };
  }

  async create(dto: CreateProductionDto, userId: number): Promise<BundleProduction> {
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();

      const [bundleRows] = await conn.query<RowDataPacket[]>(
        'SELECT * FROM bundle_products WHERE id = ? FOR UPDATE',
        [dto.bundleProductId],
      );
      const bundle = bundleRows[0];
      if (!bundle) throw new NotFoundException(`Bundle product ${dto.bundleProductId} not found`);
      if (!bundle.is_active) throw new BadRequestException(`"${bundle.name}" is inactive.`);

      const [bomLines] = await conn.query<RowDataPacket[]>(
        `SELECT bl.item_id, i.code AS item_code, i.name AS item_name, i.unit, i.rate, bl.qty_per_unit
           FROM bundle_bom_lines bl JOIN items i ON i.id = bl.item_id
          WHERE bl.bundle_product_id = ?`,
        [dto.bundleProductId],
      );
      if (!bomLines.length) {
        throw new BadRequestException(`"${bundle.name}" has no recipe (BOM) configured yet.`);
      }

      let materialCostTotal = 0;
      const shortages: RequirementLine[] = [];
      const consumptionsToInsert: {
        batchId: number;
        itemId: number;
        qty: number;
        rate: number;
        cost: number;
      }[] = [];

      for (const bom of bomLines) {
        const required = Math.round(bom.qty_per_unit * dto.qtyProduced * 1000) / 1000;
        let remaining = required;

        const [batches] = await conn.query<AvailableBatch[]>(
          `SELECT id, (qty_received - qty_consumed + qty_adjusted) AS qty_available, ? AS rate
             FROM batches
            WHERE item_id = ? AND is_quarantined = 0 AND expiry_date >= CURDATE()
              AND (qty_received - qty_consumed + qty_adjusted) > 0
            ORDER BY expiry_date ASC
            FOR UPDATE`,
          [bom.rate, bom.item_id],
        );

        let lastBatchId: number | null = null;
        for (const batch of batches) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, Number(batch.qty_available));
          if (take <= 0) continue;
          const cost = Math.round(take * Number(bom.rate) * 100) / 100;
          consumptionsToInsert.push({ batchId: batch.id, itemId: bom.item_id, qty: take, rate: bom.rate, cost });
          materialCostTotal += cost;
          remaining = Math.round((remaining - take) * 1000) / 1000;
          lastBatchId = batch.id;
        }

        if (remaining > 0) {
          const available = Math.round((required - remaining) * 1000) / 1000;
          shortages.push({
            itemId: bom.item_id,
            itemCode: bom.item_code,
            itemName: bom.item_name,
            unit: bom.unit,
            required,
            available,
            shortage: remaining,
          });

          if (dto.override && lastBatchId !== null) {
            // Admin-authorized override: over-draw the last touched batch rather
            // than block production — batch qty_available may go negative.
            const cost = Math.round(remaining * Number(bom.rate) * 100) / 100;
            consumptionsToInsert.push({ batchId: lastBatchId, itemId: bom.item_id, qty: remaining, rate: bom.rate, cost });
            materialCostTotal += cost;
          }
        }
      }

      if (shortages.length && !dto.override) {
        throw new BadRequestException({
          message: 'Insufficient stock to produce this quantity.',
          shortages,
        });
      }
      if (shortages.length && dto.override) {
        const noBatchAtAll = shortages.some(
          (s) => !consumptionsToInsert.some((c) => c.itemId === s.itemId),
        );
        if (noBatchAtAll) {
          throw new BadRequestException(
            'Cannot override: at least one ingredient has no unexpired batches to consume from.',
          );
        }
      }

      const qtyProduced = dto.qtyProduced;
      const laborCostPerUnit = dto.laborCostPerUnit ?? 0;
      const overheadCostPerUnit = dto.overheadCostPerUnit ?? 0;
      const materialCostPerUnit = materialCostTotal / qtyProduced;
      const unitCost = Math.round((materialCostPerUnit + laborCostPerUnit + overheadCostPerUnit) * 100) / 100;

      const [result] = await conn.query<any>(
        `INSERT INTO bundle_productions
           (production_number, bundle_product_id, qty_produced, produced_date, material_cost,
            labor_cost_per_unit, overhead_cost_per_unit, unit_cost, selling_price, shortage_override, created_by)
         VALUES ('', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          dto.bundleProductId,
          qtyProduced,
          dto.producedDate ?? toDateStr(new Date()),
          Math.round(materialCostTotal * 100) / 100,
          laborCostPerUnit,
          overheadCostPerUnit,
          unitCost,
          dto.sellingPrice ?? bundle.selling_price,
          shortages.length ? 1 : 0,
          userId,
        ],
      );
      const productionId = result.insertId;
      const productionNumber = `PROD-${new Date().getFullYear()}-${String(productionId).padStart(4, '0')}`;
      await conn.query('UPDATE bundle_productions SET production_number = ? WHERE id = ?', [
        productionNumber,
        productionId,
      ]);

      for (const c of consumptionsToInsert) {
        await conn.query(
          `INSERT INTO bundle_consumptions (production_id, batch_id, item_id, qty_consumed, rate_at_time, cost)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [productionId, c.batchId, c.itemId, c.qty, c.rate, c.cost],
        );
        await conn.query('UPDATE batches SET qty_consumed = qty_consumed + ? WHERE id = ?', [c.qty, c.batchId]);
      }

      await conn.commit();
      return (await this.findOne(productionId)) as unknown as BundleProduction;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }
}
