import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, ValidateNested } from 'class-validator';
import { PURCHASE_RETURN_REASON } from '../purchase-return.interface.js';

export class PurchaseReturnLineDto {
  @IsInt()
  batchId!: number;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  qty!: number;

  @IsIn(Object.values(PURCHASE_RETURN_REASON))
  reason!: number;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  remarks?: string;
}

export class CreatePurchaseReturnDto {
  @IsInt()
  grnId!: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'returnDate must be YYYY-MM-DD' })
  returnDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Enter a return quantity on at least one batch.' })
  @ValidateNested({ each: true })
  @Type(() => PurchaseReturnLineDto)
  lines!: PurchaseReturnLineDto[];
}
