import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class UpsertDeliveryLocationDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // Bundling takes ingredients from locations flagged as production sites.
  @IsOptional()
  @IsBoolean()
  isProduction?: boolean;
}
