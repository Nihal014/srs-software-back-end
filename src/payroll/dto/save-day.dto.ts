import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';

export class DayLineDto {
  @IsInt()
  staffId!: number;

  // false = not worked that day; any existing entry for the day is removed.
  @IsBoolean()
  present!: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  hours?: number;

  // Optional explicit amount (e.g. a fixed payment). Omitted = computed from the staff member's rate.
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class SaveDayDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DayLineDto)
  lines!: DayLineDto[];
}
