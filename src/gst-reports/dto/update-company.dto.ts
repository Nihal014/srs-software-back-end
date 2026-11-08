import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpdateCompanyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  legalName!: string;

  // Blank clears it. Otherwise the standard 15-character GSTIN format.
  @IsOptional()
  @Matches(/^$|^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/, { message: 'Enter a valid 15-character GSTIN, e.g. 32ABCDE1234F1Z5' })
  gstin?: string;
}
