import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { PoLineDto } from './po-line.dto.js';

const PAYMENT_TERMS = ['Net 15 days', 'Net 30 days', 'Cash on delivery'];

// Only valid while the PO is still Draft — lines are a full replace, not a patch.
export class UpdatePoDto {
  // Validated against the delivery_locations master table, not a fixed enum.
  @IsOptional()
  @IsString()
  @MinLength(2)
  deliveryLocation?: string;

  @IsOptional()
  @IsString()
  expectedDate?: string;

  @IsOptional()
  @IsIn(PAYMENT_TERMS)
  paymentTerms?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PoLineDto)
  lines?: PoLineDto[];
}
