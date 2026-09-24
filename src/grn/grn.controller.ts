import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { GrnService } from './grn.service.js';
import { CreateGrnDto } from './dto/create-grn.dto.js';
import { parsePaging } from '../common/pagination.util.js';

@Controller('grns')
export class GrnController {
  constructor(private readonly grn: GrnService) {}

  @Get()
  findAll(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const paging = parsePaging(page, pageSize);
    return paging ? this.grn.findAll(paging) : this.grn.findAll();
  }

  @Get('new-context')
  newContext(@Query('poId', ParseIntPipe) poId: number) {
    return this.grn.newContext(poId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.grn.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateGrnDto) {
    return this.grn.create(dto);
  }
}
