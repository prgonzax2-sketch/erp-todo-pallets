import { Test, TestingModule } from '@nestjs/testing';
import { EmpleadosController } from './empleados.controller.js';
import { EmpleadosService } from './empleados.service.js';

describe('EmpleadosController', () => {
  let controller: EmpleadosController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EmpleadosController],
      providers: [{ provide: EmpleadosService, useValue: {} }],
    }).compile();

    controller = module.get<EmpleadosController>(EmpleadosController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
