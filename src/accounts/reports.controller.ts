import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { USER_ROLE } from '../users/user.interface.js';

@Roles(USER_ROLE.Admin)
@Controller('accounts-report')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  summary() {
    return this.reports.summary();
  }

  @Get('pnl')
  pnl(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.profitAndLoss(from, to);
  }

  @Get('cashbook')
  cashBook(@Query('accountId') accountId?: string, @Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.cashBook(accountId ? Number(accountId) : undefined, from, to);
  }
}
