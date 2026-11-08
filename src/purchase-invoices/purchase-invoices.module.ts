import { Module } from '@nestjs/common';
import { PurchaseInvoicesService } from './purchase-invoices.service.js';
import { PurchaseInvoicesController } from './purchase-invoices.controller.js';

@Module({
  controllers: [PurchaseInvoicesController],
  providers: [PurchaseInvoicesService],
})
export class PurchaseInvoicesModule {}
