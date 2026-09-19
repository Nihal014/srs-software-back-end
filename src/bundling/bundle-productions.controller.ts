import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { BundleProductionsService } from './bundle-productions.service.js';
import { CreateProductionDto } from './dto/create-production.dto.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/auth.service.js';

@Controller('bundle-productions')
export class BundleProductionsController {
  constructor(private readonly productions: BundleProductionsService) {}

  @Get()
  findAll() {
    return this.productions.findAll();
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
