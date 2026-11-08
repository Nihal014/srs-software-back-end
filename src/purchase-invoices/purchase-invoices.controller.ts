import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { PurchaseInvoicesService } from './purchase-invoices.service.js';
import { CreatePurchaseInvoiceDto, RecordPaymentDto } from './dto/purchase-invoice.dto.js';
import { PAYMENT_STATUS_FILTER, type PaymentStatusFilter } from './purchase-invoice.interface.js';
import { parsePaging } from '../common/pagination.util.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/auth.service.js';
import { USER_ROLE } from '../users/user.interface.js';

// Money owed to suppliers is Accounts territory, so the whole screen is Admin-only.
@Roles(USER_ROLE.Admin)
@Controller('purchase-invoices')
export class PurchaseInvoicesController {
  constructor(private readonly invoices: PurchaseInvoicesService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
  ) {
    const filter = PAYMENT_STATUS_FILTER.includes(status as PaymentStatusFilter) ? (status as PaymentStatusFilter) : undefined;
    return this.invoices.findAll(parsePaging(page ?? '1', pageSize)!, filter, Number(supplierId) || undefined);
  }

  // Static routes: must stay above ':id'.
  @Get('summary')
  summary(@Query('supplierId') supplierId?: string) {
    return this.invoices.summary(Number(supplierId) || undefined);
  }

  @Get('new-context')
  newContext(@Query('grnId', ParseIntPipe) grnId: number) {
    return this.invoices.newContext(grnId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.invoices.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePurchaseInvoiceDto, @CurrentUser() user: JwtPayload) {
    return this.invoices.create(dto, user.sub);
  }

  @Post(':id/payments')
  recordPayment(@Param('id', ParseIntPipe) id: number, @Body() dto: RecordPaymentDto, @CurrentUser() user: JwtPayload) {
    return this.invoices.recordPayment(id, dto, user.sub);
  }

  @Delete(':id/payments/:paymentId')
  deletePayment(@Param('id', ParseIntPipe) id: number, @Param('paymentId', ParseIntPipe) paymentId: number) {
    return this.invoices.deletePayment(id, paymentId);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.invoices.remove(id);
  }
}
