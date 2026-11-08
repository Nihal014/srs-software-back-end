import { Module } from '@nestjs/common';
import { ProductInventoryService } from './product-inventory.service.js';
import { ProductInventoryController } from './product-inventory.controller.js';

@Module({
  controllers: [ProductInventoryController],
  providers: [ProductInventoryService],
})
export class ProductInventoryModule {}
