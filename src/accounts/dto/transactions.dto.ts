import { IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';
import { BILL_STATUS, DATE_PATTERN, RECEIPT_SOURCE } from '../accounts.interface.js';

export class UpsertExpenseDto {
  @Matches(DATE_PATTERN, { message: 'expenseDate must be YYYY-MM-DD' })
  expenseDate!: string;

  @IsString()
  @MinLength(2)
  description!: string;

  @IsInt()
  categoryId!: number;

  @IsNumber()
  @Min(0.001)
  qty: number = 1;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsInt()
  accountId!: number;

  @IsIn(Object.values(BILL_STATUS))
  billStatus: number = BILL_STATUS.Available;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class UpsertReceiptDto {
  @Matches(DATE_PATTERN, { message: 'receiptDate must be YYYY-MM-DD' })
  receiptDate!: string;

  @IsIn(Object.values(RECEIPT_SOURCE))
  source!: number;

  @IsString()
  @MinLength(2)
  description!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsInt()
  accountId!: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class UpsertSaleDto {
  @Matches(DATE_PATTERN, { message: 'saleDate must be YYYY-MM-DD' })
  saleDate!: string;

  @IsOptional()
  @IsString()
  customer?: string;

  @IsString()
  @MinLength(2)
  description!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}
