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
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const UNITS = ['kg', 'pcs', 'g', 'l', 'ml'];

export class BomLineDto {
  @IsInt()
  itemId!: number;

  @IsNumber()
  @Min(0.0001)
  qtyPerUnit!: number;
}

export class UpsertBundleProductDto {
  @IsString()
  @MinLength(2)
  code!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsIn(UNITS)
  outputUnit!: string;

  @IsNumber()
  @Min(0)
  sellingPrice: number = 0;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BomLineDto)
  bomLines!: BomLineDto[];
}
