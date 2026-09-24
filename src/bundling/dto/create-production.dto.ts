import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateProductionDto {
  @IsInt()
  bundleProductId!: number;

  @IsNumber()
  @Min(0.001)
  qtyProduced!: number;

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

  @IsOptional()
  @IsNumber()
  @Min(0)
  overheadCostPerUnit?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sellingPrice?: number;

  @IsOptional()
  @IsBoolean()
  override?: boolean;
}
