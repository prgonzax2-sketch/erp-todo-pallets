import { Test, TestingModule } from '@nestjs/testing';
import { LiquidacionesController } from './liquidaciones.controller.js';
import { LiquidacionesService } from './liquidaciones.service.js';

describe('LiquidacionesController', () => {
  let controller: LiquidacionesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LiquidacionesController],
      providers: [{ provide: LiquidacionesService, useValue: {} }],
    }).compile();

    controller = module.get<LiquidacionesController>(LiquidacionesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
