import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { StockTransfersService } from './stock-transfers.service.js';
import { CreateStockTransferDto, ReceiveStockTransferDto } from './dto/stock-transfer.dto.js';
import { parsePaging } from '../common/pagination.util.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/auth.service.js';
import { USER_ROLE } from '../users/user.interface.js';

@Controller('stock-transfers')
export class StockTransfersController {
  constructor(private readonly transfers: StockTransfersService) {}

  @Get()
  findAll(@Query('page') page: string | undefined, @Query('pageSize') pageSize: string | undefined) {
    return this.transfers.findAll(parsePaging(page ?? '1', pageSize)!);
  }

  // Static route: must stay above ':id'.
  @Get('new-context')
  newContext(@Query('fromLocationId', ParseIntPipe) fromLocationId: number) {
    return this.transfers.newContext(fromLocationId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.transfers.findOne(id);
  }

  // Sending (LTO) and receiving (LTI) are everyday jobs for whoever runs each location, so any signed-in user can do them.
  @Post()
  create(@Body() dto: CreateStockTransferDto, @CurrentUser() user: JwtPayload) {
    return this.transfers.create(dto, user.sub);
  }

  @Post(':id/receive')
  receive(@Param('id', ParseIntPipe) id: number, @Body() dto: ReceiveStockTransferDto, @CurrentUser() user: JwtPayload) {
    return this.transfers.receive(id, dto, user.sub);
  }

  @Roles(USER_ROLE.Admin)
  @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.transfers.cancel(id, user.sub);
  }
}
