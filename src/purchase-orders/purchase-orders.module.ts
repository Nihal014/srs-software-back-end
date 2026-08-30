import { Module } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service.js';
import { PurchaseOrdersController } from './purchase-orders.controller.js';
import { ItemsModule } from '../items/items.module.js';

@Module({
  imports: [ItemsModule],
  controllers: [PurchaseOrdersController],
  providers: [PurchaseOrdersService],
  exports: [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
