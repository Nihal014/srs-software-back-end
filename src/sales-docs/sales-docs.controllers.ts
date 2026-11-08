import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { parsePaging } from '../common/pagination.util.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/auth.service.js';
import { USER_ROLE } from '../users/user.interface.js';
import { PAYMENT_STATUS_FILTER, type PaymentStatusFilter } from '../purchase-invoices/purchase-invoice.interface.js';
import { SalesLocationsService } from './sales-locations.service.js';
import { QuotationsService } from './quotations.service.js';
import { SalesOrdersService } from './sales-orders.service.js';
import { DeliveryNotesService } from './delivery-notes.service.js';
import { SalesInvoicesService } from './sales-invoices.service.js';
import { SalesReturnsService } from './sales-returns.service.js';
import {
  CreateDeliveryNoteDto,
  CreateQuotationDto,
  CreateSalesInvoiceDto,
  CreateSalesOrderDto,
  CreateSalesReturnDto,
  RecordSalesPaymentDto,
  UpsertSalesLocationDto,
} from './dto/sales-docs.dto.js';

const num = (v?: string) => Number(v) || undefined;

// The whole Sales section is Admin-only: it holds prices, what customers owe and what they paid.
@Roles(USER_ROLE.Admin)
@Controller('sales-locations')
export class SalesLocationsController {
  constructor(private readonly locations: SalesLocationsService) {}

  @Get()
  findAll(@Query('all') all?: string) {
    return this.locations.findAll(all === 'true');
  }

  @Post()
  create(@Body() dto: UpsertSalesLocationDto) {
    return this.locations.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertSalesLocationDto) {
    return this.locations.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.locations.remove(id);
  }
}

@Roles(USER_ROLE.Admin)
@Controller('quotations')
export class QuotationsController {
  constructor(private readonly quotations: QuotationsService) {}

  @Get()
  findAll(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('status') status?: string) {
    return this.quotations.findAll(parsePaging(page ?? '1', pageSize)!, num(status));
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.quotations.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateQuotationDto, @CurrentUser() user: JwtPayload) {
    return this.quotations.create(dto, user.sub);
  }

  @Post(':id/accept')
  accept(@Param('id', ParseIntPipe) id: number) {
    return this.quotations.accept(id);
  }

  @Post(':id/reject')
  reject(@Param('id', ParseIntPipe) id: number) {
    return this.quotations.reject(id);
  }

  @Post(':id/convert')
  convert(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.quotations.convert(id, user.sub);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.quotations.remove(id);
  }
}

@Roles(USER_ROLE.Admin)
@Controller('sales-orders')
export class SalesOrdersController {
  constructor(private readonly orders: SalesOrdersService) {}

  @Get()
  findAll(@Query('page') page?: string, @Query('pageSize') pageSize?: string, @Query('status') status?: string) {
    return this.orders.findAll(parsePaging(page ?? '1', pageSize)!, num(status));
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.orders.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateSalesOrderDto, @CurrentUser() user: JwtPayload) {
    return this.orders.create(dto, user.sub);
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.orders.cancel(id);
  }
}

@Roles(USER_ROLE.Admin)
@Controller('delivery-notes')
export class DeliveryNotesController {
  constructor(private readonly notes: DeliveryNotesService) {}

  @Get()
  findAll(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.notes.findAll(parsePaging(page ?? '1', pageSize)!);
  }

  // Static route: must stay above ':id'.
  @Get('new-context')
  newContext(@Query('orderId', ParseIntPipe) orderId: number) {
    return this.notes.newContext(orderId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.notes.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateDeliveryNoteDto, @CurrentUser() user: JwtPayload) {
    return this.notes.create(dto, user.sub);
  }
}

@Roles(USER_ROLE.Admin)
@Controller('sales-invoices')
export class SalesInvoicesController {
  constructor(private readonly invoices: SalesInvoicesService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
  ) {
    const filter = PAYMENT_STATUS_FILTER.includes(status as PaymentStatusFilter) ? (status as PaymentStatusFilter) : undefined;
    return this.invoices.findAll(parsePaging(page ?? '1', pageSize)!, filter, num(customerId));
  }

  // Static routes: must stay above ':id'.
  @Get('summary')
  summary(@Query('customerId') customerId?: string) {
    return this.invoices.summary(num(customerId));
  }

  @Get('new-context')
  newContext(@Query('deliveryNoteId', ParseIntPipe) deliveryNoteId: number) {
    return this.invoices.newContext(deliveryNoteId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.invoices.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateSalesInvoiceDto, @CurrentUser() user: JwtPayload) {
    return this.invoices.create(dto, user.sub);
  }

  @Post(':id/payments')
  recordPayment(@Param('id', ParseIntPipe) id: number, @Body() dto: RecordSalesPaymentDto, @CurrentUser() user: JwtPayload) {
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

@Roles(USER_ROLE.Admin)
@Controller('sales-returns')
export class SalesReturnsController {
  constructor(private readonly returns: SalesReturnsService) {}

  @Get()
  findAll(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    return this.returns.findAll(parsePaging(page ?? '1', pageSize)!);
  }

  // Static route: must stay above ':id'.
  @Get('new-context')
  newContext(@Query('invoiceId', ParseIntPipe) invoiceId: number) {
    return this.returns.newContext(invoiceId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.returns.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateSalesReturnDto, @CurrentUser() user: JwtPayload) {
    return this.returns.create(dto, user.sub);
  }
}
