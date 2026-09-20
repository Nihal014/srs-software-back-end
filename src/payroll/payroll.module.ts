import { Module } from '@nestjs/common';
import { StaffService } from './staff.service.js';
import { StaffController } from './staff.controller.js';
import { PayrollService } from './payroll.service.js';
import { PayrollController } from './payroll.controller.js';

@Module({
  controllers: [StaffController, PayrollController],
  providers: [StaffService, PayrollService],
})
export class PayrollModule {}
