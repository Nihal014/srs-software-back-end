import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

const UNITS = ['kg', 'pcs', 'g', 'l', 'ml'];

export class UpsertItemDto {
  @IsString()
  @MinLength(2)
  code!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsIn(UNITS)
  unit!: string;

  // Only used when creating a brand-new item with no purchase history yet —
  // updates never touch rate, since it's the weighted-average maintained by
  // GRN postings (see ItemsService.applyWeightedAverageReceipt).
  @IsOptional()
  @IsNumber()
  @Min(0)
  rate?: number;

  @IsNumber()
  @Min(0)
  reorderLevel: number = 0;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
