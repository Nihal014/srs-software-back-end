import { IsInt, IsNumber, IsPositive, Min } from 'class-validator';

export class PoLineDto {
  @IsInt()
  itemId!: number;

  @IsNumber()
  @IsPositive()
  qtyOrdered!: number;

  @IsNumber()
  @Min(0)
  rate!: number;

  @IsNumber()
  @Min(0)
  taxPercent: number = 0;

  @IsNumber()
  @Min(0)
  discount: number = 0;
}
