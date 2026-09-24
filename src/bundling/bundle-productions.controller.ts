import { BadRequestException, Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { BundleProductionsService } from './bundle-productions.service.js';
import { CreateProductionDto } from './dto/create-production.dto.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import type { JwtPayload } from '../auth/auth.service.js';
import { USER_ROLE } from '../users/user.interface.js';
import { parsePaging } from '../common/pagination.util.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(date: string | undefined): string {
  if (!date || !DATE.test(date)) throw new BadRequestException('date must be YYYY-MM-DD');
  return date;
}

@Controller('bundle-productions')
export class BundleProductionsController {
  constructor(private readonly productions: BundleProductionsService) {}

  @Get()
  findAll(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const paging = parsePaging(page, pageSize);
    return paging ? this.productions.findAll(paging) : this.productions.findAll();
  }

  // Static routes (requirement, days, day) must stay above ':id'.
  @Get('requirement')
  checkRequirement(@Query('bundleProductId', ParseIntPipe) bundleProductId: number, @Query('qty') qty: string) {
    return this.productions.checkRequirement(bundleProductId, Number(qty));
  }

  /** One row per date that has production (the Bundling landing list). Wages: Admin only. */
  @Get('days')
  findDays(@Query('page') page: string | undefined, @Query('pageSize') pageSize: string | undefined, @CurrentUser() user: JwtPayload) {
    const paging = parsePaging(page ?? '1', pageSize) as { page: number; pageSize: number; offset: number };
    return this.productions.findDays(paging, user.role === USER_ROLE.Admin);
  }

  /** The runs of one date plus that day's payroll picture (wages are null for non-admins). */
  @Get('day')
  getDay(@Query('date') date: string, @CurrentUser() user: JwtPayload) {
    return this.productions.getDay(validDate(date), user.role === USER_ROLE.Admin);
  }

  /** Re-shares the day's payroll across its payroll-based runs, e.g. after payroll was corrected. */
  @Roles(USER_ROLE.Admin)
  @Post('recalculate-labor')
  recalculateLabor(@Body('date') date: string) {
    return this.productions.recalculateLabor(validDate(date));
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productions.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateProductionDto, @CurrentUser() user: JwtPayload) {
    return this.productions.create(dto, user.sub, user.role === USER_ROLE.Admin);
  }
}
