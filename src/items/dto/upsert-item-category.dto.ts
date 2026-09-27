import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpsertItemCategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  // Short tag such as ING or PKG. Optional; stored upper-case.
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9-]{1,10}$/, { message: 'code must be 1 to 10 letters or digits' })
  code?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
