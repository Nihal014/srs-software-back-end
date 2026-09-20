import { Module } from '@nestjs/common';
import { AccountsMasterService } from './accounts-master.service.js';
import { AccountsMasterController } from './accounts-master.controller.js';
import { ExpensesService } from './expenses.service.js';
import { ReceiptsService } from './receipts.service.js';
import { SalesService } from './sales.service.js';
import { ExpensesController, ReceiptsController, SalesController } from './transactions.controller.js';
import { ReportsService } from './reports.service.js';
import { ReportsController } from './reports.controller.js';

@Module({
  controllers: [AccountsMasterController, ExpensesController, ReceiptsController, SalesController, ReportsController],
  providers: [AccountsMasterService, ExpensesService, ReceiptsService, SalesService, ReportsService],
})
export class AccountsModule {}
