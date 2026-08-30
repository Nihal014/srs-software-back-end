import { Controller, Get } from '@nestjs/common';
import { BatchesService } from './batches.service.js';

@Controller('batches')
export class BatchesController {
  constructor(private readonly batches: BatchesService) {}

  @Get()
  findAll() {
    return this.batches.findAll();
  }
}
