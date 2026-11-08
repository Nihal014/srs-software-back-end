import { IsIn, IsNumber, IsNotIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { BATCH_ADJUSTMENT_REASON } from '../batch.interface.js';

const MANUAL_REASONS = [
  BATCH_ADJUSTMENT_REASON.Expired,
  BATCH_ADJUSTMENT_REASON.Damaged,
  BATCH_ADJUSTMENT_REASON.CountCorrection,
  BATCH_ADJUSTMENT_REASON.Other,
];

export class AdjustBatchDto {
  // Signed: negative removes stock (expired/damaged/lost), positive adds it (found extra).
  @IsNumber()
  @IsNotIn([0])
  qty!: number;

  @IsIn(MANUAL_REASONS)
  reason!: number;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  remarks?: string;
}
