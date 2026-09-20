import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';
import { ACCOUNT_TYPE, DATE_PATTERN, PL_GROUP } from '../accounts.interface.js';

export class UpsertCategoryDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsIn(Object.values(PL_GROUP))
  plGroup!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertAccountDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsIn(Object.values(ACCOUNT_TYPE))
  accountType!: number;

  @IsNumber()
  openingBalance: number = 0;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateReadyProductsDto {
  @Matches(DATE_PATTERN, { message: 'asOfDate must be YYYY-MM-DD' })
  asOfDate!: string;

  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}
