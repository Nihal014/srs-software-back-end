import { Module } from '@nestjs/common';
import { SalesLocationsService } from './sales-locations.service.js';
import { QuotationsService } from './quotations.service.js';
import { SalesOrdersService } from './sales-orders.service.js';
import { DeliveryNotesService } from './delivery-notes.service.js';
import { SalesInvoicesService } from './sales-invoices.service.js';
import { SalesReturnsService } from './sales-returns.service.js';
import {
  DeliveryNotesController,
  QuotationsController,
  SalesInvoicesController,
  SalesLocationsController,
  SalesOrdersController,
  SalesReturnsController,
} from './sales-docs.controllers.js';

@Module({
  controllers: [
    SalesLocationsController,
    QuotationsController,
    SalesOrdersController,
    DeliveryNotesController,
    SalesInvoicesController,
    SalesReturnsController,
  ],
  providers: [SalesLocationsService, QuotationsService, SalesOrdersService, DeliveryNotesService, SalesInvoicesService, SalesReturnsService],
})
export class SalesDocsModule {}
