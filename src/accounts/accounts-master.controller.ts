import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { AccountsMasterService } from './accounts-master.service.js';
import { CreateReadyProductsDto, UpsertAccountDto, UpsertCategoryDto } from './dto/masters.dto.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { USER_ROLE } from '../users/user.interface.js';

// The whole Accounts module is Admin-only.
@Roles(USER_ROLE.Admin)
@Controller()
export class AccountsMasterController {
  constructor(private readonly master: AccountsMasterService) {}

  @Get('expense-categories')
  listCategories(@Query('all') all?: string) {
    return this.master.listCategories(all === 'true');
  }

  @Post('expense-categories')
  createCategory(@Body() dto: UpsertCategoryDto) {
    return this.master.createCategory(dto);
  }

  @Patch('expense-categories/:id')
  updateCategory(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertCategoryDto) {
    return this.master.updateCategory(id, dto);
  }

  @Delete('expense-categories/:id')
  removeCategory(@Param('id', ParseIntPipe) id: number) {
    return this.master.removeCategory(id);
  }

  @Get('accounts')
  listAccounts(@Query('all') all?: string) {
    return this.master.listAccounts(all === 'true');
  }

  @Post('accounts')
  createAccount(@Body() dto: UpsertAccountDto) {
    return this.master.createAccount(dto);
  }

  @Patch('accounts/:id')
  updateAccount(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertAccountDto) {
    return this.master.updateAccount(id, dto);
  }

  @Delete('accounts/:id')
  removeAccount(@Param('id', ParseIntPipe) id: number) {
    return this.master.removeAccount(id);
  }

  @Get('ready-products')
  listReadyProducts() {
    return this.master.listReadyProducts();
  }

  @Post('ready-products')
  createReadyProducts(@Body() dto: CreateReadyProductsDto) {
    return this.master.createReadyProducts(dto);
  }

  @Delete('ready-products/:id')
  removeReadyProducts(@Param('id', ParseIntPipe) id: number) {
    return this.master.removeReadyProducts(id);
  }
}
