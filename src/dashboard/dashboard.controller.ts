import { Controller, Get } from '@nestjs/common';
import { DashboardService } from './dashboard.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/auth.service.js';
import { USER_ROLE } from '../users/user.interface.js';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  /** Open to every logged-in user; money, wages and stock value are only filled in for Admins. */
  @Get()
  get(@CurrentUser() user: JwtPayload) {
    return this.dashboard.get(user.role === USER_ROLE.Admin);
  }
}
