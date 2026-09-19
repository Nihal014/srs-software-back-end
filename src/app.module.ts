import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './config/database.module.js';
import { UsersModule } from './users/users.module.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard.js';
import { RolesGuard } from './auth/guards/roles.guard.js';
import { SuppliersModule } from './suppliers/suppliers.module.js';
import { ItemsModule } from './items/items.module.js';
import { DeliveryLocationsModule } from './delivery-locations/delivery-locations.module.js';
import { PurchaseOrdersModule } from './purchase-orders/purchase-orders.module.js';
import { GrnModule } from './grn/grn.module.js';
import { BatchesModule } from './batches/batches.module.js';
import { BundlingModule } from './bundling/bundling.module.js';

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    AuthModule,
    SuppliersModule,
    ItemsModule,
    DeliveryLocationsModule,
    PurchaseOrdersModule,
    GrnModule,
    BatchesModule,
    BundlingModule,
  ],
  providers: [
    // Every route requires a valid JWT by default (opt out with @Public()),
    // then RolesGuard additionally checks @Roles() where present.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
