import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { PoLineDto } from './po-line.dto.js';

const PAYMENT_TERMS = ['Net 15 days', 'Net 30 days', 'Cash on delivery'];

export class CreatePoDto {
  @IsInt()
  supplierId!: number;

  // Validated against the delivery_locations master table, not a fixed
  // enum — any admin-added location name is valid here.
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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PoLineDto)
  lines!: PoLineDto[];
}
