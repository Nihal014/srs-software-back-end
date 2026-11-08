import { Module } from '@nestjs/common';
import { PurchaseReturnsService } from './purchase-returns.service.js';
import { PurchaseReturnsController } from './purchase-returns.controller.js';

@Module({
  controllers: [PurchaseReturnsController],
  providers: [PurchaseReturnsService],
})
export class PurchaseReturnsModule {}
