import { BadRequestException, Body, Controller, Get, Put, Query } from '@nestjs/common';
import { GstReportsService } from './gst-reports.service.js';
import { UpdateCompanyDto } from './dto/update-company.dto.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { USER_ROLE } from '../users/user.interface.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function optionalDate(name: string, value?: string) {
  if (value && !DATE.test(value)) throw new BadRequestException(`${name} must be YYYY-MM-DD`);
  return value || undefined;
}

// Tax figures are an admin matter, like the rest of Accounts and Analytics.
@Roles(USER_ROLE.Admin)
@Controller('gst-reports')
export class GstReportsController {
  constructor(private readonly gst: GstReportsService) {}

  @Get()
  report(@Query('from') from?: string, @Query('to') to?: string) {
    return this.gst.report(optionalDate('from', from), optionalDate('to', to));
  }

  @Get('company')
  company() {
    return this.gst.company();
  }

  @Put('company')
  updateCompany(@Body() dto: UpdateCompanyDto) {
    return this.gst.updateCompany(dto);
  }
}
