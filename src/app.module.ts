import { Module } from '@nestjs/common';
import { DatabaseModule } from './config/database.module.js';
import { SuppliersModule } from './suppliers/suppliers.module.js';
import { ItemsModule } from './items/items.module.js';
import { DeliveryLocationsModule } from './delivery-locations/delivery-locations.module.js';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module.js';
import { GrnModule } from './grn/grn.module.js';
import { BatchesModule } from './batches/batches.module.js';

@Module({
  imports: [
    DatabaseModule,
    SuppliersModule,
    ItemsModule,
    DeliveryLocationsModule,
    PurchaseOrdersModule,
    GrnModule,
    BatchesModule,
  ],
})
export class AppModule {}
