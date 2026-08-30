import { Module } from '@nestjs/common';
import { DeliveryLocationsService } from './delivery-locations.service.js';
import { DeliveryLocationsController } from './delivery-locations.controller.js';

@Module({
  controllers: [DeliveryLocationsController],
  providers: [DeliveryLocationsService],
  exports: [DeliveryLocationsService],
})
export class DeliveryLocationsModule {}
