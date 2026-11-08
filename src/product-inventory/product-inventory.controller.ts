import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ProductInventoryService } from './product-inventory.service.js';
import { CreateProductAuditDto, CreateProductWastageDto } from './dto/product-inventory.dto.js';
import { parsePaging } from '../common/pagination.util.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { JwtPayload } from '../auth/auth.service.js';
import { USER_ROLE } from '../users/user.interface.js';

@Controller('product-inventory')
export class ProductInventoryController {
  constructor(private readonly inventory: ProductInventoryService) {}

  @Get('status')
  status() {
    return this.inventory.status();
  }

  @Get('lots')
  lots(@Query('page') page: string | undefined, @Query('pageSize') pageSize: string | undefined, @Query('locationId') locationId?: string) {
    return this.inventory.lots(parsePaging(page ?? '1', pageSize)!, Number(locationId) || undefined);
  }

  @Get('audits')
  audits(@Query('page') page: string | undefined, @Query('pageSize') pageSize: string | undefined) {
    return this.inventory.audits(parsePaging(page ?? '1', pageSize)!);
  }

  // A count changes what stock the system believes in, so (like ingredient batch corrections) it is Admin-only.
  @Roles(USER_ROLE.Admin)
  @Post('audits')
  createAudit(@Body() dto: CreateProductAuditDto, @CurrentUser() user: JwtPayload) {
    return this.inventory.createAudit(dto, user.sub);
  }

  @Get('wastage')
  wastage(@Query('page') page: string | undefined, @Query('pageSize') pageSize: string | undefined) {
    return this.inventory.wastage(parsePaging(page ?? '1', pageSize)!);
  }

  @Roles(USER_ROLE.Admin)
  @Post('wastage')
  createWastage(@Body() dto: CreateProductWastageDto, @CurrentUser() user: JwtPayload) {
    return this.inventory.createWastage(dto, user.sub);
  }
}
