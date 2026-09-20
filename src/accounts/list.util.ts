import { BadRequestException } from '@nestjs/common';
import { DATE_PATTERN, type ListQuery } from './accounts.interface.js';

export function paging(q: ListQuery) {
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 25));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export function assertDate(value: string | undefined, label: string) {
  if (value !== undefined && value !== '' && !DATE_PATTERN.test(value)) {
    throw new BadRequestException(`${label} must be YYYY-MM-DD`);
  }
}

/** Adds the from/to date-range conditions for `column` to a WHERE builder. */
export function addDateRange(column: string, q: ListQuery, where: string[], params: unknown[]) {
  assertDate(q.from, 'from');
  assertDate(q.to, 'to');
  if (q.from) {
    where.push(`${column} >= ?`);
    params.push(q.from);
  }
  if (q.to) {
    where.push(`${column} <= ?`);
    params.push(q.to);
  }
}

export function addSearch(columns: string[], q: ListQuery, where: string[], params: unknown[]) {
  const term = q.search?.trim();
  if (!term) return;
  where.push(`(${columns.map((c) => `${c} LIKE ?`).join(' OR ')})`);
  for (let i = 0; i < columns.length; i++) params.push(`%${term}%`);
}
