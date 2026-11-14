import { Test, TestingModule } from '@nestjs/testing';
import { PartesDiariosController } from './partes-diarios.controller.js';
import { PartesDiariosService } from './partes-diarios.service.js';

describe('PartesDiariosController', () => {
  let controller: PartesDiariosController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PartesDiariosController],
      providers: [{ provide: PartesDiariosService, useValue: {} }],
    }).compile();

    controller = module.get<PartesDiariosController>(PartesDiariosController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
