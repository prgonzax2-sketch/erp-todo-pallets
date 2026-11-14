import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AdelantosService } from './adelantos.service.js';
import { Adelanto } from './entities/adelanto.entity.js';
import { Empleado } from '../empleados/entities/empleado.entity.js';

describe('AdelantosService', () => {
  let service: AdelantosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdelantosService,
        { provide: getRepositoryToken(Adelanto), useValue: {} },
        { provide: getRepositoryToken(Empleado), useValue: {} },
      ],
    }).compile();

    service = module.get<AdelantosService>(AdelantosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
