import { Body, Controller, Delete, Get, NotFoundException, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { StaffService } from './staff.service.js';
import { UpsertStaffDto } from './dto/upsert-staff.dto.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { USER_ROLE } from '../users/user.interface.js';

// Wages are sensitive, so the whole payroll module is Admin-only.
@Roles(USER_ROLE.Admin)
@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  findAll(@Query('all') all?: string) {
    return this.staff.findAll(all === 'true');
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const staff = await this.staff.findById(id);
    if (!staff) throw new NotFoundException(`Staff ${id} not found`);
    return staff;
  }

  @Post()
  create(@Body() dto: UpsertStaffDto) {
    return this.staff.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertStaffDto) {
    return this.staff.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.staff.remove(id);
  }
}
