// Numeric code convention, mirrored by hand in the frontend (payroll.model.ts).
export const PAY_TYPE = {
  Hourly: 1,
  Daily: 2,
} as const;

export type PayType = (typeof PAY_TYPE)[keyof typeof PAY_TYPE];

export interface Staff {
  id: number;
  name: string;
  phone: string | null;
  pay_type: PayType;
  pay_rate: number;
  is_active: boolean;
}

export interface DayEntryRow {
  staff_id: number;
  name: string;
  pay_type: PayType;
  pay_rate: number;
  entry_id: number | null;
  hours: number | null;
  amount: number | null;
}

export interface DaySheet {
  date: string;
  rows: DayEntryRow[];
  total: number;
  staffCount: number;
}
