/** Shape returned by any list endpoint that was asked to paginate. */
export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Parses `page`/`pageSize` query params into `{page, pageSize, offset}`, or `null` when the
 * caller didn't ask to paginate (no `page` param) — that keeps every existing unpaginated
 * caller (dropdowns, cross-item aggregations) getting the plain array they always got, while a
 * list screen that passes `page` gets `{rows, total, page, pageSize}` back instead.
 */
export function parsePaging(page?: string, pageSize?: string): { page: number; pageSize: number; offset: number } | null {
  if (page === undefined || page === null || page === '') return null;
  const p = Math.max(1, Number(page) || 1);
  const ps = Math.min(200, Math.max(1, Number(pageSize) || 25));
  return { page: p, pageSize: ps, offset: (p - 1) * ps };
}
