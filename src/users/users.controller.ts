import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { ApproveUserDto } from './dto/approve-user.dto.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { USER_ROLE } from './user.interface.js';

@Roles(USER_ROLE.Admin)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  findAll() {
    return this.users.findAll();
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.users.update(id, dto);
  }

  @Post(':id/approve')
  approve(@Param('id', ParseIntPipe) id: number, @Body() dto: ApproveUserDto) {
    return this.users.approve(id, dto.role as any);
  }

  @Post(':id/reject')
  reject(@Param('id', ParseIntPipe) id: number) {
    return this.users.reject(id);
  }
}
