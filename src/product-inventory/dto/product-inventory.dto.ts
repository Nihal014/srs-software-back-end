import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, ValidateNested } from 'class-validator';
import { PRODUCT_WASTAGE_REASON } from '../product-inventory.interface.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class AuditLineDto {
  @IsInt()
  bundleProductId!: number;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  countedQty!: number;
}

export class CreateProductAuditDto {
  @IsInt()
  locationId!: number;

  @IsOptional()
  @Matches(DATE, { message: 'auditDate must be YYYY-MM-DD' })
  auditDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Enter the counted quantity for at least one product.' })
  @ValidateNested({ each: true })
  @Type(() => AuditLineDto)
  lines!: AuditLineDto[];
}

export class CreateProductWastageDto {
  @IsInt()
  locationId!: number;

  @IsInt()
  bundleProductId!: number;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  qty!: number;

  @IsIn(Object.values(PRODUCT_WASTAGE_REASON))
  reason!: number;

  @IsOptional()
  @Matches(DATE, { message: 'wastageDate must be YYYY-MM-DD' })
  wastageDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  remarks?: string;
}
