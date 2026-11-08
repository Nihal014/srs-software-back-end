import { Inject, Injectable } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import type { UpdateCompanyDto } from './dto/update-company.dto.js';

const round2 = (n: number) => Math.round(n * 100) / 100;
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;

/** A GSTIN's first two digits are the state code. Anything that is not a proper GSTIN counts as unregistered. */
function stateOf(gstin: string | null | undefined): string | null {
  const g = (gstin ?? '').trim().toUpperCase();
  return GSTIN.test(g) ? g.slice(0, 2) : null;
}

export interface GstRow {
  doc_type: 'Invoice' | 'Credit note' | 'Bill' | 'Debit note';
  doc_number: string;
  doc_date: string;
  party_name: string;
  gstin: string | null;
  registered: boolean;
  supply: 'Intra-state' | 'Inter-state';
  rate: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  total: number;
  /** Purchases only: tax charged by an unregistered supplier can't be claimed back. */
  itc_eligible: boolean;
}

interface RawLine extends RowDataPacket {
  doc_number: string;
  doc_date: string;
  party_name: string;
  gstin: string | null;
  rate: number;
  taxable: number;
  tax: number;
}

@Injectable()
export class GstReportsService {
  constructor(@Inject(DB_POOL) private readonly pool: Pool) {}

  async company() {
    const [rows] = await this.pool.query<RowDataPacket[]>('SELECT legal_name, gstin FROM company_settings WHERE id = 1');
    const c = rows[0] ?? { legal_name: 'RSR BAKES', gstin: null };
    return { legal_name: c.legal_name as string, gstin: (c.gstin as string | null) ?? null, state_code: stateOf(c.gstin) };
  }

  async updateCompany(dto: UpdateCompanyDto) {
    await this.pool.query(
      `INSERT INTO company_settings (id, legal_name, gstin) VALUES (1, ?, ?)
       ON DUPLICATE KEY UPDATE legal_name = VALUES(legal_name), gstin = VALUES(gstin)`,
      [dto.legalName.trim(), dto.gstin?.trim() || null],
    );
    return this.company();
  }

  /** Turns a line's tax into CGST + SGST (same state) or IGST (other state). Credit notes carry negative signs. */
  private toRow(
    line: RawLine,
    kind: GstRow['doc_type'],
    sign: 1 | -1,
    companyState: string | null,
  ): GstRow {
    const partyState = stateOf(line.gstin);
    const inter = !!companyState && !!partyState && companyState !== partyState;
    const taxable = round2(Number(line.taxable));
    const tax = round2(Number(line.tax));
    const half = round2(tax / 2);
    return {
      doc_type: kind,
      doc_number: line.doc_number,
      doc_date: line.doc_date,
      party_name: line.party_name,
      gstin: line.gstin ? line.gstin.trim().toUpperCase() : null,
      registered: !!partyState,
      supply: inter ? 'Inter-state' : 'Intra-state',
      rate: Number(line.rate),
      taxable: sign * taxable,
      cgst: inter ? 0 : sign * half,
      sgst: inter ? 0 : sign * round2(tax - half),
      igst: inter ? sign * tax : 0,
      tax: sign * tax,
      total: sign * round2(taxable + tax),
      itc_eligible: !!partyState,
    };
  }

  private summarise(rows: GstRow[]) {
    const byRate = new Map<number, { rate: number; taxable: number; cgst: number; sgst: number; igst: number; tax: number; total: number }>();
    for (const r of rows) {
      const g = byRate.get(r.rate) ?? { rate: r.rate, taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0, total: 0 };
      g.taxable += r.taxable;
      g.cgst += r.cgst;
      g.sgst += r.sgst;
      g.igst += r.igst;
      g.tax += r.tax;
      g.total += r.total;
      byRate.set(r.rate, g);
    }
    const list = [...byRate.values()].sort((a, b) => a.rate - b.rate).map((g) => ({
      rate: g.rate,
      taxable: round2(g.taxable),
      cgst: round2(g.cgst),
      sgst: round2(g.sgst),
      igst: round2(g.igst),
      tax: round2(g.tax),
      total: round2(g.total),
    }));
    const totals = list.reduce(
      (a, g) => ({
        taxable: round2(a.taxable + g.taxable),
        cgst: round2(a.cgst + g.cgst),
        sgst: round2(a.sgst + g.sgst),
        igst: round2(a.igst + g.igst),
        tax: round2(a.tax + g.tax),
        total: round2(a.total + g.total),
      }),
      { taxable: 0, cgst: 0, sgst: 0, igst: 0, tax: 0, total: 0 },
    );
    return { byRate: list, totals };
  }

  /**
   * GST for a period. Output tax comes from sales invoices (less sales returns, which are credit notes);
   * input tax from supplier invoices, taken from the tax rates on the goods received against them (less
   * purchase returns). Dates filter on the invoice / return date.
   */
  async report(from?: string, to?: string) {
    const company = await this.company();
    const range = (col: string) => `${from ? ` AND ${col} >= ?` : ''}${to ? ` AND ${col} <= ?` : ''}`;
    const params = [...(from ? [from] : []), ...(to ? [to] : [])];

    const [saleLines] = await this.pool.query<RawLine[]>(
      `SELECT si.invoice_number AS doc_number, DATE_FORMAT(si.invoice_date, '%Y-%m-%d') AS doc_date,
              c.name AS party_name, c.gstin, l.tax_percent AS rate,
              ROUND(l.qty * l.rate - l.discount, 2) AS taxable,
              ROUND(l.amount - (l.qty * l.rate - l.discount), 2) AS tax
         FROM sales_invoice_lines l
         JOIN sales_invoices si ON si.id = l.sales_invoice_id
         JOIN customers c ON c.id = si.customer_id
        WHERE 1 = 1 ${range('si.invoice_date')}
        ORDER BY si.invoice_date, si.id, l.id`,
      params,
    );
    // A sales return's amount already includes tax, so the tax is split back out using the invoice line's rate.
    const [saleReturnLines] = await this.pool.query<RawLine[]>(
      `SELECT r.return_number AS doc_number, DATE_FORMAT(r.return_date, '%Y-%m-%d') AS doc_date,
              c.name AS party_name, c.gstin, il.tax_percent AS rate,
              ROUND(rl.amount / (1 + il.tax_percent / 100), 2) AS taxable,
              ROUND(rl.amount - rl.amount / (1 + il.tax_percent / 100), 2) AS tax
         FROM sales_return_lines rl
         JOIN sales_returns r ON r.id = rl.sales_return_id
         JOIN sales_invoice_lines il ON il.id = rl.invoice_line_id
         JOIN customers c ON c.id = r.customer_id
        WHERE 1 = 1 ${range('r.return_date')}
        ORDER BY r.return_date, r.id, rl.id`,
      params,
    );
    // What a supplier billed is not split by tax rate on the invoice screen, so the tax comes from the
    // rates agreed on the purchase order for the goods accepted on the GRN the invoice is against.
    const [purchaseLines] = await this.pool.query<RawLine[]>(
      `SELECT pi.supplier_invoice_no AS doc_number, DATE_FORMAT(pi.invoice_date, '%Y-%m-%d') AS doc_date,
              s.name AS party_name, s.gstin, pol.tax_percent AS rate,
              ROUND(gl.qty_accepted * pol.rate - pol.discount * gl.qty_accepted / NULLIF(pol.qty_ordered, 0), 2) AS taxable,
              ROUND((gl.qty_accepted * pol.rate - pol.discount * gl.qty_accepted / NULLIF(pol.qty_ordered, 0)) * pol.tax_percent / 100, 2) AS tax
         FROM purchase_invoices pi
         JOIN suppliers s ON s.id = pi.supplier_id
         JOIN grn_lines gl ON gl.grn_id = pi.grn_id AND gl.qty_accepted > 0
         JOIN purchase_order_lines pol ON pol.id = gl.purchase_order_line_id
        WHERE 1 = 1 ${range('pi.invoice_date')}
        ORDER BY pi.invoice_date, pi.id, gl.id`,
      params,
    );
    const [purchaseReturnLines] = await this.pool.query<RawLine[]>(
      `SELECT pr.return_number AS doc_number, DATE_FORMAT(pr.return_date, '%Y-%m-%d') AS doc_date,
              s.name AS party_name, s.gstin, pol.tax_percent AS rate,
              ROUND(prl.amount, 2) AS taxable,
              ROUND(prl.amount * pol.tax_percent / 100, 2) AS tax
         FROM purchase_return_lines prl
         JOIN purchase_returns pr ON pr.id = prl.purchase_return_id
         JOIN suppliers s ON s.id = pr.supplier_id
         JOIN batches b ON b.id = prl.batch_id
         JOIN grn_lines gl ON gl.id = b.grn_line_id
         JOIN purchase_order_lines pol ON pol.id = gl.purchase_order_line_id
        WHERE 1 = 1 ${range('pr.return_date')}
        ORDER BY pr.return_date, pr.id, prl.id`,
      params,
    );

    const cs = company.state_code;
    const salesRows = [
      ...saleLines.map((l) => this.toRow(l, 'Invoice', 1, cs)),
      ...saleReturnLines.map((l) => this.toRow(l, 'Credit note', -1, cs)),
    ].sort((a, b) => a.doc_date.localeCompare(b.doc_date) || a.doc_number.localeCompare(b.doc_number));
    const purchaseRows = [
      ...purchaseLines.map((l) => this.toRow(l, 'Bill', 1, cs)),
      ...purchaseReturnLines.map((l) => this.toRow(l, 'Debit note', -1, cs)),
    ].sort((a, b) => a.doc_date.localeCompare(b.doc_date) || a.doc_number.localeCompare(b.doc_number));

    const sales = { rows: salesRows, ...this.summarise(salesRows) };
    const claimable = purchaseRows.filter((r) => r.itc_eligible);
    const purchases = { rows: purchaseRows, ...this.summarise(purchaseRows) };
    const inputTax = this.summarise(claimable).totals;
    const unclaimable = round2(purchases.totals.tax - inputTax.tax);

    const outputTax = sales.totals;
    return {
      company,
      from: from ?? null,
      to: to ?? null,
      sales,
      purchases,
      summary: {
        output: { cgst: outputTax.cgst, sgst: outputTax.sgst, igst: outputTax.igst, tax: outputTax.tax },
        input: { cgst: inputTax.cgst, sgst: inputTax.sgst, igst: inputTax.igst, tax: inputTax.tax },
        // Positive = tax to pay; negative = more input credit than output tax this period.
        netPayable: round2(outputTax.tax - inputTax.tax),
        unclaimableInput: unclaimable,
      },
    };
  }
}
