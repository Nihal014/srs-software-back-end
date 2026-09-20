import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ExpensesService } from './expenses.service.js';
import { ReceiptsService } from './receipts.service.js';
import { SalesService } from './sales.service.js';
import { UpsertExpenseDto, UpsertReceiptDto, UpsertSaleDto } from './dto/transactions.dto.js';
import type { ListQuery } from './accounts.interface.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/auth.service.js';
import { USER_ROLE } from '../users/user.interface.js';

@Roles(USER_ROLE.Admin)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  list(@Query() q: ListQuery) {
    return this.expenses.list(q);
  }

  @Post()
  create(@Body() dto: UpsertExpenseDto, @CurrentUser() user: JwtPayload) {
    return this.expenses.create(dto, user.sub);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertExpenseDto) {
    return this.expenses.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.expenses.remove(id);
  }
}

@Roles(USER_ROLE.Admin)
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Get()
  list(@Query() q: ListQuery) {
    return this.receipts.list(q);
  }

  @Post()
  create(@Body() dto: UpsertReceiptDto, @CurrentUser() user: JwtPayload) {
    return this.receipts.create(dto, user.sub);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertReceiptDto) {
    return this.receipts.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.receipts.remove(id);
  }
}

@Roles(USER_ROLE.Admin)
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Get()
  list(@Query() q: ListQuery) {
    return this.sales.list(q);
  }

  @Post()
  create(@Body() dto: UpsertSaleDto, @CurrentUser() user: JwtPayload) {
    return this.sales.create(dto, user.sub);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertSaleDto) {
    return this.sales.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.sales.remove(id);
  }
}
