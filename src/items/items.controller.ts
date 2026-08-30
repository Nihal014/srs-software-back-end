import { Body, Controller, Delete, Get, Param, ParseIntPipe, NotFoundException, Patch, Post, Query } from '@nestjs/common';
import { ItemsService } from './items.service.js';
import { UpsertItemDto } from './dto/upsert-item.dto.js';

@Controller('items')
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  findAll(@Query('all') all?: string) {
    return all === 'true' ? this.items.findAllForAdmin() : this.items.findAll();
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
