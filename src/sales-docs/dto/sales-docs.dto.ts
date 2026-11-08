import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SALES_RETURN_REASON } from '../sales-docs.interface.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = (field: string) => ({ message: `${field} must be YYYY-MM-DD` });

export class UpsertSalesLocationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class DocLineDto {
  @IsInt()
  productId!: number;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  qty!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  rate!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxPercent!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discount!: number;
}

export class CreateQuotationDto {
  @IsInt()
  customerId!: number;

  @IsOptional()
  @IsInt()
  salesLocationId?: number | null;

  @IsOptional()
  @Matches(DATE, DATE_MESSAGE('quotationDate'))
  quotationDate?: string;

  // Omitted = 15 days after the quotation date.
  @IsOptional()
  @Matches(DATE, DATE_MESSAGE('validUntil'))
  validUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one line.' })
  @ValidateNested({ each: true })
  @Type(() => DocLineDto)
  lines!: DocLineDto[];
}

export class CreateSalesOrderDto {
  @IsInt()
  customerId!: number;

  @IsOptional()
  @IsInt()
  salesLocationId?: number | null;

  @IsOptional()
  @Matches(DATE, DATE_MESSAGE('orderDate'))
  orderDate?: string;

  @IsOptional()
  @Matches(DATE, DATE_MESSAGE('expectedDate'))
  expectedDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one line.' })
  @ValidateNested({ each: true })
  @Type(() => DocLineDto)
  lines!: DocLineDto[];
}

export class DeliveryLineDto {
  @IsInt()
  orderLineId!: number;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  qty!: number;
}

export class CreateDeliveryNoteDto {
  @IsInt()
  salesOrderId!: number;

  @IsOptional()
  @Matches(DATE, DATE_MESSAGE('deliveryDate'))
  deliveryDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  receivedBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  vehicleNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => DeliveryLineDto)
  lines!: DeliveryLineDto[];
}

export class CreateSalesInvoiceDto {
  @IsInt()
  customerId!: number;

  // Billing a delivery note; leave out for a direct (counter) sale.
  @IsOptional()
  @IsInt()
  deliveryNoteId?: number | null;

  @IsOptional()
  @IsInt()
  salesLocationId?: number | null;

  @IsOptional()
  @Matches(DATE, DATE_MESSAGE('invoiceDate'))
  invoiceDate?: string;

  // Omitted = invoice date plus the customer's payment terms.
  @IsOptional()
  @Matches(DATE, DATE_MESSAGE('dueDate'))
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Add at least one line.' })
  @ValidateNested({ each: true })
  @Type(() => DocLineDto)
  lines!: DocLineDto[];
}

export class RecordSalesPaymentDto {
  @IsOptional()
  @Matches(DATE, DATE_MESSAGE('paymentDate'))
  paymentDate?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  // The account the money was received into.
  @IsInt()
  accountId!: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remarks?: string;
}

export class ReturnLineDto {
  @IsInt()
  invoiceLineId!: number;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  qty!: number;

  @IsIn(Object.values(SALES_RETURN_REASON))
  reason!: number;
}

export class CreateSalesReturnDto {
  @IsInt()
  invoiceId!: number;

  @IsOptional()
  @Matches(DATE, DATE_MESSAGE('returnDate'))
  returnDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnLineDto)
  lines!: ReturnLineDto[];
}
