import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PartesDiariosService } from './partes-diarios.service.js';
import { ParteDiario } from './entities/parte-diario.entity.js';
import { Empleado } from '../empleados/entities/empleado.entity.js';

describe('PartesDiariosService', () => {
  let service: PartesDiariosService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PartesDiariosService,
        { provide: getRepositoryToken(ParteDiario), useValue: {} },
        { provide: getRepositoryToken(Empleado), useValue: {} },
      ],
    }).compile();

    service = module.get<PartesDiariosService>(PartesDiariosService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
