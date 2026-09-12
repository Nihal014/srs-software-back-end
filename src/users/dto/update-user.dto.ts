import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { USER_ROLE } from '../user.interface.js';

export class UpdateUserDto {
  @IsOptional()
  @IsIn(Object.values(USER_ROLE))
  role?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
