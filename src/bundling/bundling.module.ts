import { Module } from '@nestjs/common';
import { BundleProductsService } from './bundle-products.service.js';
import { BundleProductsController } from './bundle-products.controller.js';
import { BundleProductionsService } from './bundle-productions.service.js';
import { BundleProductionsController } from './bundle-productions.controller.js';

@Module({
  controllers: [BundleProductsController, BundleProductionsController],
  providers: [BundleProductsService, BundleProductionsService],
  exports: [BundleProductsService, BundleProductionsService],
})
export class BundlingModule {}
