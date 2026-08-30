import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { PoLineDto } from './po-line.dto.js';

const DELIVERY_LOCATIONS = ['Kollam Production Unit', 'Cold Store — Chinnakada'];
const PAYMENT_TERMS = ['Net 15 days', 'Net 30 days', 'Cash on delivery'];

export class CreatePoDto {
  @IsInt()
  supplierId!: number;

  @IsOptional()
  @IsIn(DELIVERY_LOCATIONS)
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
