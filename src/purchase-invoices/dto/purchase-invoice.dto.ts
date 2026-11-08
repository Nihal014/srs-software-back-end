import { IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class CreatePurchaseInvoiceDto {
  @IsInt()
  grnId!: number;

  // The number printed on the supplier's own bill.
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  supplierInvoiceNo!: string;

  @Matches(DATE, { message: 'invoiceDate must be YYYY-MM-DD' })
  invoiceDate!: string;

  // Omitted = invoice date plus the supplier's payment terms.
  @IsOptional()
  @Matches(DATE, { message: 'dueDate must be YYYY-MM-DD' })
  dueDate?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remarks?: string;
}

export class RecordPaymentDto {
  @IsOptional()
  @Matches(DATE, { message: 'paymentDate must be YYYY-MM-DD' })
  paymentDate?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  // Where the money came from (bank, cash or a partner), from the Accounts master.
  @IsInt()
  accountId!: number;

  // Expense category the payment is booked under in Accounts (normally Raw materials).
  @IsInt()
  categoryId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remarks?: string;
}
