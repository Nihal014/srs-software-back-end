import { BadRequestException, Body, Controller, Get, ParseIntPipe, Put, Query } from '@nestjs/common';
import { PayrollService } from './payroll.service.js';
import { SaveDayDto } from './dto/save-day.dto.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/auth.service.js';
import { USER_ROLE } from '../users/user.interface.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

@Roles(USER_ROLE.Admin)
@Controller('payroll')
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get('day')
  getDay(@Query('date') date: string) {
    return this.payroll.getDay(this.validDate(date));
  }

  @Put('day')
  saveDay(@Body() dto: SaveDayDto, @CurrentUser() user: JwtPayload) {
    return this.payroll.saveDay(dto, user.sub);
  }

  @Get('day-total')
  getDayTotal(@Query('date') date: string) {
    return this.payroll.getDayTotal(this.validDate(date));
  }

  @Get('month')
  getMonth(@Query('month') month: string) {
    return this.payroll.getMonth(month);
  }

  @Get('year')
  getYear(@Query('year', ParseIntPipe) year: number) {
    return this.payroll.getYear(year);
  }

  private validDate(date: string) {
    if (!DATE.test(date ?? '')) throw new BadRequestException('date must be YYYY-MM-DD');
    return date;
  }
}
