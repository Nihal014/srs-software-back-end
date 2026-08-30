import { Body, Controller, Delete, Get, Param, ParseIntPipe, NotFoundException, Patch, Post, Query } from '@nestjs/common';
import { SuppliersService } from './suppliers.service.js';
import { UpsertSupplierDto } from './dto/upsert-supplier.dto.js';

@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get()
  findAll(@Query('all') all?: string) {
    return all === 'true' ? this.suppliers.findAllForAdmin() : this.suppliers.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const supplier = await this.suppliers.findById(id);
    if (!supplier) throw new NotFoundException(`Supplier ${id} not found`);
    return supplier;
  }

  @Post()
  create(@Body() dto: UpsertSupplierDto) {
    return this.suppliers.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertSupplierDto) {
    return this.suppliers.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.suppliers.remove(id);
  }
}
