import { Body, Controller, Delete, Get, Param, ParseIntPipe, NotFoundException, Patch, Post, Query } from '@nestjs/common';
import { ItemsService } from './items.service.js';
import { UpsertItemDto } from './dto/upsert-item.dto.js';
import { parsePaging } from '../common/pagination.util.js';

@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  findAll(@Query('all') all?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    if (all !== 'true') return this.items.findAll();
    const paging = parsePaging(page, pageSize);
    return paging ? this.items.findAllForAdmin(paging) : this.items.findAllForAdmin();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const item = await this.items.findById(id);
    if (!item) throw new NotFoundException(`Item ${id} not found`);
    return item;
  }

  @Post()
  create(@Body() dto: UpsertItemDto) {
    return this.items.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertItemDto) {
    return this.items.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.items.remove(id);
  }
}
