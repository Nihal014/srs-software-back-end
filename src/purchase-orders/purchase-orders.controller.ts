import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service.js';
import { CreatePoDto } from './dto/create-po.dto.js';
import { UpdatePoDto } from './dto/update-po.dto.js';
import { ApprovePoDto } from './dto/approve-po.dto.js';
import type { PoStatus } from './po.interface.js';

@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrders: PurchaseOrdersService) {}

  @Get()
  findAll(@Query('status', new ParseIntPipe({ optional: true })) status?: number) {
    return this.purchaseOrders.findAll(status as PoStatus | undefined);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.purchaseOrders.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePoDto) {
    return this.purchaseOrders.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePoDto) {
    return this.purchaseOrders.update(id, dto);
  }

  @Post(':id/send-for-approval')
  sendForApproval(@Param('id', ParseIntPipe) id: number) {
    return this.purchaseOrders.sendForApproval(id);
  }

  @Post(':id/approve')
  approve(@Param('id', ParseIntPipe) id: number, @Body() dto: ApprovePoDto) {
    return this.purchaseOrders.approve(id, dto.acknowledgeThreshold ?? false);
  }

  @Post(':id/send-to-supplier')
  sendToSupplier(@Param('id', ParseIntPipe) id: number) {
    return this.purchaseOrders.sendToSupplier(id);
  }

  @Post(':id/close')
  close(@Param('id', ParseIntPipe) id: number) {
    return this.purchaseOrders.close(id);
  }
}
