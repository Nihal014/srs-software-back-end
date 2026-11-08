import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { PurchaseReturnsService } from './purchase-returns.service.js';
import { CreatePurchaseReturnDto } from './dto/create-purchase-return.dto.js';
import { parsePaging } from '../common/pagination.util.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/auth.service.js';
import { USER_ROLE } from '../users/user.interface.js';

@Controller('purchase-returns')
export class PurchaseReturnsController {
  constructor(private readonly returns: PurchaseReturnsService) {}

  @Get()
  findAll(@Query('page') page?: string, @Query('pageSize') pageSize?: string) {
    const paging = parsePaging(page, pageSize);
    return paging ? this.returns.findAll(paging) : this.returns.findAll();
  }

  @Get('new-context')
  newContext(@Query('grnId', ParseIntPipe) grnId: number) {
    return this.returns.newContext(grnId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.returns.findOne(id);
  }

  // A return takes stock out of inventory, so like a stock write-off it is Admin-only.
  @Roles(USER_ROLE.Admin)
  @Post()
  create(@Body() dto: CreatePurchaseReturnDto, @CurrentUser() user: JwtPayload) {
    return this.returns.create(dto, user.sub);
  }

  @Roles(USER_ROLE.Admin)
  @Post(':id/credit-received')
  markCreditReceived(@Param('id', ParseIntPipe) id: number) {
    return this.returns.markCreditReceived(id);
  }
}
