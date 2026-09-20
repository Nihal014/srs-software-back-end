import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { PAY_TYPE } from '../payroll.interface.js';

export class UpsertStaffDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsIn(Object.values(PAY_TYPE))
  payType!: number;

  @IsNumber()
  @Min(0)
  payRate!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
