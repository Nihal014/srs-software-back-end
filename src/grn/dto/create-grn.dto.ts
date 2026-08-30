import { Type } from 'class-transformer';
import { IsArray, IsInt, IsISO8601, IsOptional, IsString, ValidateNested } from 'class-validator';
import { GrnLineDto } from './grn-line.dto.js';

export class CreateGrnDto {
  @IsInt()
  poId!: number;

  @IsOptional()
  @IsISO8601()
  receivedDate?: string;

  @IsOptional()
  @IsString()
  remarks?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GrnLineDto)
  lines!: GrnLineDto[];
}
