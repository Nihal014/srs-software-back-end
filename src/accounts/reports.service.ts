import { Inject, Injectable } from '@nestjs/common';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../config/database.module.js';
import { ACCOUNT_TYPE, PL_GROUP, RECEIPT_SOURCE, round2 } from './accounts.interface.js';
import { AccountsMasterService } from './accounts-master.service.js';
import { assertDate } from './list.util.js';

const NUM = (v: unknown) => Number(v ?? 0);

function localDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

@Injectable()
export class ReportsService {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly master: AccountsMasterService,
  ) {}

  /**
   * P&L exactly as the client's sheet computes it:
   *   revenue = sales + unsold "ready products" (at sales value)
   *   gross margin = revenue - direct costs;   net margin = gross - other expenses
   *   both margin percentages are taken on sales. Capital spend (assets, factory setup) stays out.
   */
  async profitAndLoss(from?: string, to?: string) {
    assertDate(from, 'from');
    assertDate(to, 'to');
    const start = from || '1900-01-01';
    const end = to || '9999-12-31';

    const [cats] = await this.pool.query<RowDataPacket[]>(
      `SELECT c.id, c.name, c.pl_group, COALESCE(SUM(e.amount), 0) AS total
         FROM expense_categories c
         LEFT JOIN expenses e ON e.category_id = c.id AND e.expense_date BETWEEN ? AND ?
        GROUP BY c.id, c.name, c.pl_group
       HAVING total <> 0
        ORDER BY c.pl_group, total DESC`,
      [start, end],
    );
    const [salesRows] = await this.pool.query<RowDataPacket[]>(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM sales WHERE sale_date BETWEEN ? AND ?',
      [start, end],
    );
    const [readyRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT DATE_FORMAT(as_of_date, '%Y-%m-%d') AS as_of, amount FROM ready_products
        WHERE as_of_date <= ? ORDER BY as_of_date DESC, id DESC LIMIT 1`,
      [end],
    );

    const lines = (group: number) =>
      cats.filter((c) => c.pl_group === group).map((c) => ({ categoryId: c.id as number, name: c.name as string, total: round2(NUM(c.total)) }));
    const sum = (arr: { total: number }[]) => round2(arr.reduce((a, l) => a + l.total, 0));

    const direct = lines(PL_GROUP.DirectCost);
    const other = lines(PL_GROUP.OtherExpense);
    const capital = lines(PL_GROUP.Capital);
    const sales = round2(NUM(salesRows[0].total));
    const ready = { amount: round2(NUM(readyRows[0]?.amount)), asOf: (readyRows[0]?.as_of as string) ?? null };
    const revenue = round2(sales + ready.amount);
    const gross = round2(revenue - sum(direct));
    const net = round2(gross - sum(other));

    return {
      from: from || null,
      to: to || null,
      sales,
      readyProducts: ready,
      revenue,
      directCosts: { lines: direct, total: sum(direct) },
      grossMargin: gross,
      grossMarginPct: sales > 0 ? gross / sales : null,
      otherExpenses: { lines: other, total: sum(other) },
      netMargin: net,
      netMarginPct: sales > 0 ? net / sales : null,
      capital: { lines: capital, total: sum(capital) },
    };
  }

  /** Chronological money-in / money-out with a running balance (the client's "Account Details" sheet). */
  async cashBook(accountId?: number, from?: string, to?: string) {
    assertDate(from, 'from');
    assertDate(to, 'to');

    const acctCond = accountId ? ' AND x.account_id = ?' : '';
    const acctParams = accountId ? [accountId] : [];

    const [openRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(opening_balance), 0) AS total FROM accounts ${accountId ? 'WHERE id = ?' : ''}`,
      acctParams,
    );
    let opening = NUM(openRows[0].total);
    if (from) {
      const [prior] = await this.pool.query<RowDataPacket[]>(
        `SELECT
           (SELECT COALESCE(SUM(x.amount), 0) FROM receipts x WHERE x.receipt_date < ?${acctCond}) AS money_in,
           (SELECT COALESCE(SUM(x.amount), 0) FROM expenses x WHERE x.expense_date < ?${acctCond}) AS money_out`,
        [from, ...acctParams, from, ...acctParams],
      );
      opening += NUM(prior[0].money_in) - NUM(prior[0].money_out);
    }

    const rCond: string[] = [];
    const eCond: string[] = [];
    const rParams: unknown[] = [];
    const eParams: unknown[] = [];
    if (from) { rCond.push('x.receipt_date >= ?'); rParams.push(from); eCond.push('x.expense_date >= ?'); eParams.push(from); }
    if (to) { rCond.push('x.receipt_date <= ?'); rParams.push(to); eCond.push('x.expense_date <= ?'); eParams.push(to); }
    if (accountId) { rCond.push('x.account_id = ?'); rParams.push(accountId); eCond.push('x.account_id = ?'); eParams.push(accountId); }
    const rWhere = rCond.length ? `WHERE ${rCond.join(' AND ')}` : '';
    const eWhere = eCond.length ? `WHERE ${eCond.join(' AND ')}` : '';

    const [rows] = await this.pool.query<RowDataPacket[]>(
      `(SELECT 'R' AS kind, x.id, DATE_FORMAT(x.receipt_date, '%Y-%m-%d') AS entry_date, x.description,
              x.amount AS money_in, 0 AS money_out, a.name AS account_name, 'Receipt' AS category, x.receipt_date AS sort_date
         FROM receipts x JOIN accounts a ON a.id = x.account_id ${rWhere})
       UNION ALL
       (SELECT 'E', x.id, DATE_FORMAT(x.expense_date, '%Y-%m-%d'), x.description,
              0, x.amount, a.name, c.name, x.expense_date
         FROM expenses x JOIN accounts a ON a.id = x.account_id JOIN expense_categories c ON c.id = x.category_id ${eWhere})
       ORDER BY sort_date, FIELD(kind, 'R', 'E'), id`,
      [...rParams, ...eParams],
    );

    let balance = opening;
    let totalIn = 0;
    let totalOut = 0;
    const entries = rows.map((r) => {
      const moneyIn = NUM(r.money_in);
      const moneyOut = NUM(r.money_out);
      balance = round2(balance + moneyIn - moneyOut);
      totalIn += moneyIn;
      totalOut += moneyOut;
      return {
        kind: r.kind as 'R' | 'E',
        id: r.id as number,
        date: r.entry_date as string,
        description: r.description as string,
        category: r.category as string,
        account: r.account_name as string,
        moneyIn,
        moneyOut,
        balance,
      };
    });
    return {
      openingBalance: round2(opening),
      totalIn: round2(totalIn),
      totalOut: round2(totalOut),
      closingBalance: round2(balance),
      entries,
    };
  }

  /** One-screen picture, mirroring the client's "Total summary" sheet. */
  async summary() {
    const now = new Date();
    const today = localDate(now);
    const monthStart = localDate(new Date(now.getFullYear(), now.getMonth(), 1));

    const one = async (sql: string, params: unknown[] = []) => NUM(((await this.pool.query<RowDataPacket[]>(sql, params))[0][0] as any).v);

    const capitalInvestment = await one('SELECT COALESCE(SUM(amount), 0) AS v FROM receipts WHERE source = ?', [RECEIPT_SOURCE.Capital]);
    const allExpenses = await one('SELECT COALESCE(SUM(amount), 0) AS v FROM expenses');
    const totalSales = await one('SELECT COALESCE(SUM(amount), 0) AS v FROM sales');
    const salesPayments = await one('SELECT COALESCE(SUM(amount), 0) AS v FROM receipts WHERE source = ?', [RECEIPT_SOURCE.SalesPayment]);
    const monthSales = await one('SELECT COALESCE(SUM(amount), 0) AS v FROM sales WHERE sale_date BETWEEN ? AND ?', [monthStart, today]);
    const monthExpenses = await one('SELECT COALESCE(SUM(amount), 0) AS v FROM expenses WHERE expense_date BETWEEN ? AND ?', [monthStart, today]);
    const monthPaymentsReceived = await one(
      'SELECT COALESCE(SUM(amount), 0) AS v FROM receipts WHERE source = ? AND receipt_date BETWEEN ? AND ?',
      [RECEIPT_SOURCE.SalesPayment, monthStart, today],
    );

    const pnl = await this.profitAndLoss();
    const accounts = (await this.master.listAccounts(false)) as RowDataPacket[];
    const balances = accounts.map((a) => ({
      id: a.id as number,
      name: a.name as string,
      accountType: a.account_type as number,
      balance: round2(NUM(a.balance)),
    }));
    // Partners paid personally, so their balances are not company money and stay out of the total.
    const companyCash = round2(balances.filter((a) => a.accountType !== ACCOUNT_TYPE.Partner).reduce((s, a) => s + a.balance, 0));
    const dueReceivable = round2(totalSales - salesPayments);

    return {
      asOf: today,
      capitalInvestment: round2(capitalInvestment),
      allExpenses: round2(allExpenses),
      totalSales: round2(totalSales),
      grossProfit: pnl.grossMargin,
      grossProfitPct: pnl.grossMarginPct,
      netProfit: pnl.netMargin,
      netProfitPct: pnl.netMarginPct,
      dueReceivable,
      readyProducts: pnl.readyProducts,
      balances,
      companyTotal: round2(companyCash + pnl.readyProducts.amount + dueReceivable),
      thisMonth: {
        label: now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
        sales: round2(monthSales),
        expenses: round2(monthExpenses),
        paymentsReceived: round2(monthPaymentsReceived),
      },
    };
  }
}
