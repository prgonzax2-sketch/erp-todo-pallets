import { Test, TestingModule } from '@nestjs/testing';
import { AdelantosController } from './adelantos.controller.js';
import { AdelantosService } from './adelantos.service.js';

describe('AdelantosController', () => {
  let controller: AdelantosController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdelantosController],
      providers: [{ provide: AdelantosService, useValue: {} }],
    }).compile();

    controller = module.get<AdelantosController>(AdelantosController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
