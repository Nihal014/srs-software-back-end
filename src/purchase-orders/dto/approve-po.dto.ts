import { IsOptional, IsBoolean } from 'class-validator';

export class ApprovePoDto {
  // Must be explicitly true to approve a PO over the Rs 50,000 threshold —
  // stands in for the "second approval" sign-off until a real auth/roles
  // module exists.
  @IsOptional()
  @IsBoolean()
  acknowledgeThreshold?: boolean;
}
