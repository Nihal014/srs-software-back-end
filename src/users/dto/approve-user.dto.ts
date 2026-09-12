import { IsIn, IsOptional } from 'class-validator';
import { USER_ROLE } from '../user.interface.js';

export class ApproveUserDto {
  @IsOptional()
  @IsIn(Object.values(USER_ROLE))
  role?: number;
}
