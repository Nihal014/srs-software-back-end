import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { BatchesService } from './batches.service.js';
import { parsePaging } from '../common/pagination.util.js';
import { AdjustBatchDto } from './dto/adjust-batch.dto.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { USER_ROLE } from '../users/user.interface.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/auth.service.js';

@Controller('batches')
export class BatchesController {
  constructor(private readonly batches: BatchesService) {}

  @Get()
  findAll(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const paging = parsePaging(page, pageSize);
    return paging ? this.batches.findAll(paging) : this.batches.findAll();
  }

  @Get(':id/adjustments')
  adjustments(@Param('id', ParseIntPipe) id: number) {
    return this.batches.adjustmentsFor(id);
  }

  // Corrects a batch's stock (write off expired/damaged, fix a count, add stock back) — sensitive
  // enough (it changes what Bundling can use and what Inventory reports) to be Admin-only.
  @Roles(USER_ROLE.Admin)
  @Post(':id/adjustments')
  adjust(@Param('id', ParseIntPipe) id: number, @Body() dto: AdjustBatchDto, @CurrentUser() user: JwtPayload) {
    return this.batches.adjust(id, dto, user.sub);
  }
}
