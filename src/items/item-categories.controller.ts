import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ItemCategoriesService } from './item-categories.service.js';
import { UpsertItemCategoryDto } from './dto/upsert-item-category.dto.js';

@Controller('item-categories')
export class ItemCategoriesController {
  constructor(private readonly categories: ItemCategoriesService) {}

  @Get()
  findAll(@Query('all') all?: string) {
    return this.categories.findAll(all === 'true');
  }

  @Post()
  create(@Body() dto: UpsertItemCategoryDto) {
    return this.categories.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertItemCategoryDto) {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.categories.remove(id);
  }
}
