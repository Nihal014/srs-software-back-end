import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { CustomersService } from './customers.service.js';
import { UpsertCustomerDto } from './dto/upsert-customer.dto.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { USER_ROLE } from '../users/user.interface.js';

// Customers belong to the Sales section, which is Admin-only.
@Roles(USER_ROLE.Admin)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  findAll(@Query('all') all?: string) {
    return this.customers.findAll(all === 'true');
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const customer = await this.customers.findById(id);
    if (!customer) throw new NotFoundException(`Customer ${id} not found`);
    return customer;
  }

  @Post()
  create(@Body() dto: UpsertCustomerDto) {
    return this.customers.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertCustomerDto) {
    return this.customers.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.customers.remove(id);
  }
}
