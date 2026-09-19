import { Body, Controller, Delete, Get, NotFoundException, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { BundleProductsService } from './bundle-products.service.js';
import { UpsertBundleProductDto } from './dto/upsert-bundle-product.dto.js';

@Controller('bundle-products')
export class BundleProductsController {
  constructor(private readonly bundleProducts: BundleProductsService) {}

  @Get()
  findAll(@Query('all') all?: string) {
    return all === 'true' ? this.bundleProducts.findAllForAdmin() : this.bundleProducts.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const bundle = await this.bundleProducts.findById(id);
    if (!bundle) throw new NotFoundException(`Bundle product ${id} not found`);
    return bundle;
  }

  @Post()
  create(@Body() dto: UpsertBundleProductDto) {
    return this.bundleProducts.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertBundleProductDto) {
    return this.bundleProducts.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.bundleProducts.remove(id);
  }
}
