import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { BundleProductionsService } from './bundle-productions.service.js';
import { CreateProductionDto } from './dto/create-production.dto.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/auth.service.js';
import { parsePaging } from '../common/pagination.util.js';

@Controller('bundle-productions')
export class BundleProductionsController {
  constructor(private readonly productions: BundleProductionsService) {}

  @Get()
  findAll(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const paging = parsePaging(page, pageSize);
    return paging ? this.productions.findAll(paging) : this.productions.findAll();
  }

  @Get('requirement')
  checkRequirement(@Query('bundleProductId', ParseIntPipe) bundleProductId: number, @Query('qty') qty: string) {
    return this.productions.checkRequirement(bundleProductId, Number(qty));
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productions.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateProductionDto, @CurrentUser() user: JwtPayload) {
    return this.productions.create(dto, user.sub);
  }
}
