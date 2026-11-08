import { Module } from '@nestjs/common';
import { GstReportsService } from './gst-reports.service.js';
import { GstReportsController } from './gst-reports.controller.js';

@Module({
  controllers: [GstReportsController],
  providers: [GstReportsService],
})
export class GstReportsModule {}
