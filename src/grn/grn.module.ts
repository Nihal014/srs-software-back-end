import { Module } from '@nestjs/common';
import { GrnService } from './grn.service.js';
import { GrnController } from './grn.controller.js';
import { ItemsModule } from '../items/items.module.js';
import { PurchaseOrdersModule } from '../purchase-orders/purchase-orders.module.js';

@Module({
  imports: [ItemsModule, PurchaseOrdersModule],
  controllers: [GrnController],
  providers: [GrnService],
})
export class GrnModule {}
