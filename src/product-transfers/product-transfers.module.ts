import { Module } from '@nestjs/common';
import { ProductTransfersService } from './product-transfers.service.js';
import { ProductTransfersController } from './product-transfers.controller.js';

@Module({
  controllers: [ProductTransfersController],
  providers: [ProductTransfersService],
})
export class ProductTransfersModule {}
