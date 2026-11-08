import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class OtherCostDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amountPerUnit!: number;
}

export class UsedQuantityDto {
  @IsInt()
  itemId!: number;

  // The TOTAL of this ingredient actually used for the whole run (as in the client's "Total used qty" column).
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  qty!: number;
}

export class CreateProductionDto {
  @IsInt()
  bundleProductId!: number;

  @IsNumber()
  @Min(0.001)
  qtyProduced!: number;

  // Where the finished pieces are stored; defaults to the production location.
  @IsOptional()
  @IsInt()
  locationId?: number;

  @IsOptional()
  @IsString()
  producedDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  laborCostPerUnit?: number;

  // Admin only: take labour from that day's payroll, shared across all payroll-based runs on the
  // date (wages / total units). laborCostPerUnit is ignored when this is true.
  @IsOptional()
  @IsBoolean()
  laborFromPayroll?: boolean;

  // Named costs per unit besides ingredients and labour (freezing, gas & electricity, packing, cold storage, transport...).
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OtherCostDto)
  otherCosts?: OtherCostDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  sellingPrice?: number;

  @IsOptional()
  @IsBoolean()
  override?: boolean;

  // What was really used per ingredient. Left out = the recipe's target quantity for the run. Stock is taken for these amounts.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UsedQuantityDto)
  usedQuantities?: UsedQuantityDto[];
}
