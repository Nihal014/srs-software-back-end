import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, Min, ValidateNested } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ProductTransferLineDto {
  @IsInt()
  lotId!: number;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  qty!: number;
}

export class CreateProductTransferDto {
  @IsInt()
  fromLocationId!: number;

  @IsInt()
  toLocationId!: number;

  @IsOptional()
  @Matches(DATE, { message: 'transferDate must be YYYY-MM-DD' })
  transferDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Enter a quantity to send on at least one lot.' })
  @ValidateNested({ each: true })
  @Type(() => ProductTransferLineDto)
  lines!: ProductTransferLineDto[];
}

export class ReceiveProductLineDto {
  @IsInt()
  lineId!: number;

  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  qtyReceived!: number;
}

export class ReceiveProductTransferDto {
  @IsOptional()
  @Matches(DATE, { message: 'receivedDate must be YYYY-MM-DD' })
  receivedDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  remarks?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceiveProductLineDto)
  lines!: ReceiveProductLineDto[];
}
