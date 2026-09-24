import { IsIn, IsNumber, IsNotIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { BATCH_ADJUSTMENT_REASON } from '../batch.interface.js';

export class AdjustBatchDto {
  // Signed: negative removes stock (expired/damaged/lost), positive adds it (found extra).
  @IsNumber()
  @IsNotIn([0])
  qty!: number;

  @IsIn(Object.values(BATCH_ADJUSTMENT_REASON))
  reason!: number;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  remarks?: string;
}
