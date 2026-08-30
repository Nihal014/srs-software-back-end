import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { DeliveryLocationsService } from './delivery-locations.service.js';
import { UpsertDeliveryLocationDto } from './dto/upsert-delivery-location.dto.js';

@Controller('delivery-locations')
export class DeliveryLocationsController {
  constructor(private readonly deliveryLocations: DeliveryLocationsService) {}

  @Get()
  findAll(@Query('all') all?: string) {
    return all === 'true' ? this.deliveryLocations.findAllForAdmin() : this.deliveryLocations.findAll();
  }

  @Post()
  create(@Body() dto: UpsertDeliveryLocationDto) {
    return this.deliveryLocations.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpsertDeliveryLocationDto) {
    return this.deliveryLocations.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.deliveryLocations.remove(id);
  }
}
