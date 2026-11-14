import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LiquidacionesService } from './liquidaciones.service.js';
import { Liquidacion } from './entities/liquidacion.entity.js';
import { Empleado } from '../empleados/entities/empleado.entity.js';
import { ParteDiario } from '../partes-diarios/entities/parte-diario.entity.js';

describe('LiquidacionesService', () => {
  let service: LiquidacionesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LiquidacionesService,
        { provide: getRepositoryToken(Liquidacion), useValue: {} },
        { provide: getRepositoryToken(Empleado), useValue: {} },
        { provide: getRepositoryToken(ParteDiario), useValue: {} },
      ],
    }).compile();

    service = module.get<LiquidacionesService>(LiquidacionesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
