import { Module } from '@nestjs/common';
import { StockTransfersService } from './stock-transfers.service.js';
import { StockTransfersController } from './stock-transfers.controller.js';

@Module({
  controllers: [StockTransfersController],
  providers: [StockTransfersService],
})
export class StockTransfersModule {}
