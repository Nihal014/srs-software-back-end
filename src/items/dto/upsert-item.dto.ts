import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

const UNITS = ['kg', 'pcs', 'g', 'l', 'ml'];

export class UpsertItemDto {
  // Left out when creating = generated from the category's code (CODE-00001, CODE-00002...). On an update,
  // left out = keep the current code.
  @IsOptional()
  @IsString()
  @MinLength(2)
  code?: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsIn(UNITS)
  unit!: string;

  // Optional category from Master Data. null clears it; leaving it out on an update keeps the current one.
  @IsOptional()
  @IsInt()
  categoryId?: number | null;

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
