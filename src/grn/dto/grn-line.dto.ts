import { IsInt, IsISO8601, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class GrnLineDto {
  @IsInt()
  purchaseOrderLineId!: number;

  @IsNumber()
  @Min(0)
  qtyReceived!: number;

  @IsNumber()
  @Min(0)
  qtyAccepted!: number;

  @IsNumber()
  @Min(0)
  qtyRejected: number = 0;

  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @IsOptional()
  @IsString()
  batchNumber?: string;

  @IsISO8601()
  mfgDate!: string;

  @IsISO8601()
  expiryDate!: string;
}
