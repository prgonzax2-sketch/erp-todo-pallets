import { ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { ProduccionEntity } from './entities/produccion.entity.js';
import { ProduccionService } from './produccion.service.js';

const registro = (id: number, aserradero: string): ProduccionEntity => ({
  id,
  fecha: '2026-10-11',
  turno: 'MANANA',
  tipoProducto: 'Tabla',
  especie: 'Eucalipto',
  descripcionProducto: 'Tabla',
  observaciones: 'Seca',
  aserradero,
  lote: `L-${id}`,
  unidadMedida: 'P2',
  unidadDimensiones: 'MILIMETROS',
  unidadResultado: 'P2',
  cantidadPaquetes: 2,
  piezasPorPaquete: 10,
  espesor: 25,
  ancho: 100,
  largo: 2000,
  separadores: [],
  tacos: [],
  tags: [],
  createdAt: new Date('2026-10-11T12:00:00Z'),
});

describe('ProduccionService', () => {
  const produccionRepository = {
    create: vi.fn((entry: Partial<ProduccionEntity>) => entry),
    find: vi.fn(),
    findOneBy: vi.fn(),
    save: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const aserraderoRepository = {
    findOneBy: vi.fn(async ({ nombre }: { nombre: string }) => ({ nombre, activo: true })),
  };
  let service: ProduccionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ProduccionService(
      produccionRepository as unknown as Repository<ProduccionEntity>,
      aserraderoRepository as unknown as Repository<never>,
    );
  });

  it('limita el stock al aserradero asignado y devuelve medidas y observaciones', async () => {
    produccionRepository.find.mockResolvedValue([registro(1, 'Norte'), registro(2, 'Sur')]);

    const stock = await service.listarStock({}, { rol: 'admin', aserradero: 'Norte' } as AuthenticatedUser);

    expect(stock).toHaveLength(1);
    expect(stock[0]).toMatchObject({
      aserradero: 'Norte',
      lote: 'L-1',
      producto: 'Tabla',
      especie: 'Eucalipto',
      observaciones: 'Seca',
      espesorReal: 25,
      anchoReal: 100,
      largoReal: 2000,
      paquetesDisponibles: 2,
      piezasDisponibles: 20,
      ids: [1],
    });
  });

  it('agrupa paquetes idénticos aunque provengan de lotes y observaciones distintas', async () => {
    const separadorA = { medida: { espesor: 10, ancho: 80, largo: 1000 }, cantidad: 2, piezasPorSeparador: 4 };
    const separadorB = { medida: { espesor: 12, ancho: 80, largo: 1000 }, cantidad: 1, piezasPorSeparador: 2 };
    const primero = { ...registro(1, 'Norte'), separadores: [separadorA, separadorB], tacos: [{ medida: { espesor: 30, ancho: 50, largo: 100 }, cantidad: 2, piezasPorTaco: 4 }], tags: [{ nombre: 'Seco' }] };
    const segundo = { ...registro(2, 'Norte'), tipoProducto: 'TABLA', descripcionProducto: 'tabla', especie: 'EUCALIPTO', unidadDimensiones: 'milimetros', lote: 'L-2', cantidadPaquetes: 3, observaciones: 'Sin corteza', separadores: [separadorB, separadorA], tacos: [{ medida: { espesor: 30, ancho: 50, largo: 100 }, cantidad: 2, piezasPorTaco: 4 }], tags: [{ nombre: 'Certificado' }] };
    produccionRepository.find.mockResolvedValue([primero, segundo]);

    const stock = await service.listarStock({}, { rol: 'admin', aserradero: 'Norte' } as AuthenticatedUser);

    expect(stock).toHaveLength(1);
    expect(stock[0]).toMatchObject({
      paquetesDisponibles: 5,
      piezasPorPaquete: 10,
      piezasDisponibles: 50,
      lote: 'Varios (2)',
      lotes: [{ lote: 'L-1', ids: [1] }, { lote: 'L-2', ids: [2] }],
      registros: expect.arrayContaining([
        expect.objectContaining({ id: 1, cantidadPaquetes: 2, piezasPorPaquete: 10, separadores: expect.any(Array), tacos: expect.any(Array) }),
        expect.objectContaining({ id: 2, cantidadPaquetes: 3, piezasPorPaquete: 10, separadores: expect.any(Array), tacos: expect.any(Array) }),
      ]),
      observaciones: 'Seca; Sin corteza',
      tags: [{ nombre: 'Seco' }, { nombre: 'Certificado' }],
    });
  });

  it('agrupa los 6 y 4 paquetes del stock real ignorando piezas derivadas de los componentes', async () => {
    const separadoresBase = [{ medida: { espesor: 19, ancho: 90, largo: 1000 }, cantidad: 12 }];
    const tacosBase = [{ medida: { espesor: 90, ancho: 90, largo: 1150 }, cantidad: 2 }];
    produccionRepository.find.mockResolvedValue([
      { ...registro(2, 'Saladas'), tipoProducto: 'TABLA', especie: 'Eucalipto', lote: 'Saladas', cantidadPaquetes: 6, piezasPorPaquete: 566, espesor: 18, ancho: 100, largo: 1200, separadores: [{ ...separadoresBase[0], piezasPorSeparador: 72 }], tacos: [{ ...tacosBase[0], piezasPorTaco: 12 }] },
      { ...registro(8, 'Saladas'), tipoProducto: 'Tabla', especie: 'EUCALIPTO', lote: 'Saladas', cantidadPaquetes: 4, piezasPorPaquete: 566, espesor: 18, ancho: 100, largo: 1200, separadores: [{ ...separadoresBase[0], piezasPorSeparador: 48 }], tacos: [{ ...tacosBase[0], piezasPorTaco: 8 }] },
    ]);

    const stock = await service.listarStock({}, { rol: 'admin', aserradero: 'Saladas' } as AuthenticatedUser);

    expect(stock).toHaveLength(1);
    expect(stock[0]).toMatchObject({ paquetesDisponibles: 10, piezasPorPaquete: 566, piezasDisponibles: 5660, ids: [2, 8] });
  });

  it('consolida paquetes idénticos entre plantas y devuelve el desglose por aserradero', async () => {
    produccionRepository.find.mockResolvedValue([
      registro(1, 'Norte'),
      { ...registro(2, 'Sur'), cantidadPaquetes: 3, lote: 'L-Sur' },
    ]);

    const stock = await service.listarStock({}, { rol: 'admin' } as AuthenticatedUser);
    const stockSur = await service.listarStock({ aserradero: 'Sur' }, { rol: 'admin' } as AuthenticatedUser);

    expect(stock).toHaveLength(1);
    expect(stock[0]).toMatchObject({
      paquetesDisponibles: 5,
      piezasDisponibles: 50,
      aserradero: 'Varios (2)',
      aserraderos: [
        { aserradero: 'Norte', paquetesDisponibles: 2, piezasDisponibles: 20 },
        { aserradero: 'Sur', paquetesDisponibles: 3, piezasDisponibles: 30 },
      ],
    });
    expect(stockSur).toHaveLength(1);
    expect(stockSur[0]).toMatchObject({ paquetesDisponibles: 3, aserraderos: [{ aserradero: 'Sur' }] });
  });

  it('no agrupa paquetes si cambia la cantidad de tablas o el taco pie', async () => {
    produccionRepository.find.mockResolvedValue([
      registro(1, 'Norte'),
      { ...registro(2, 'Norte'), piezasPorPaquete: 12 },
      { ...registro(3, 'Norte'), tacos: [{ medida: { espesor: 30, ancho: 50, largo: 100 }, cantidad: 2, piezasPorTaco: 4 }] },
    ]);

    const stock = await service.listarStock({}, { rol: 'admin', aserradero: 'Norte' } as AuthenticatedUser);

    expect(stock).toHaveLength(3);
    expect(stock.map(item => item.piezasPorPaquete)).toEqual([10, 12, 10]);
  });

  it('filtra observaciones antes de sumar los paquetes idénticos', async () => {
    produccionRepository.find.mockResolvedValue([
      { ...registro(1, 'Norte'), cantidadPaquetes: 2, observaciones: 'Mancha en una cara' },
      { ...registro(2, 'Norte'), cantidadPaquetes: 3, lote: 'L-2', observaciones: 'Sin defectos' },
    ]);

    const stock = await service.listarStock({ observaciones: 'mancha' }, { rol: 'admin', aserradero: 'Norte' } as AuthenticatedUser);

    expect(stock).toHaveLength(1);
    expect(stock[0]).toMatchObject({ observaciones: 'Mancha en una cara', paquetesDisponibles: 2, piezasDisponibles: 20 });
  });

  it('permite editar observaciones solo dentro del aserradero asignado', async () => {
    produccionRepository.find.mockResolvedValue([registro(1, 'Norte')]);
    produccionRepository.update.mockResolvedValue({ affected: 1 });

    await expect(service.actualizarObservaciones([1], 'Paquetes manchados', { rol: 'admin', aserradero: 'Norte' } as AuthenticatedUser))
      .resolves.toEqual({ updated: 1, observaciones: 'Paquetes manchados' });

    expect(produccionRepository.update).toHaveBeenCalledTimes(1);
  });

  it('rechaza editar observaciones de otro aserradero', async () => {
    produccionRepository.find.mockResolvedValue([registro(1, 'Sur')]);

    await expect(service.actualizarObservaciones([1], 'Paquetes manchados', { rol: 'admin', aserradero: 'Norte' } as AuthenticatedUser))
      .rejects.toBeInstanceOf(ForbiddenException);

    expect(produccionRepository.update).not.toHaveBeenCalled();
  });

  it('rechaza la edición de lote a un administrador con aserradero asignado', async () => {
    await expect(service.actualizarLote([1], 'L-traslado', 'Sur', { rol: 'admin', aserradero: 'Norte' } as AuthenticatedUser))
      .rejects.toBeInstanceOf(ForbiddenException);

    expect(produccionRepository.update).not.toHaveBeenCalled();
  });

  it('permite al administrador general actualizar el lote', async () => {
    produccionRepository.update.mockResolvedValue({ affected: 1 });

    await expect(service.actualizarLote([1], 'L-traslado', 'Sur', { rol: 'admin' } as AuthenticatedUser))
      .resolves.toEqual({ updated: 1, lote: 'L-traslado', aserradero: 'Sur' });

    expect(produccionRepository.update).toHaveBeenCalledTimes(1);
  });

  it('fuerza el aserradero asignado al guardar producción', async () => {
    produccionRepository.save.mockImplementation(async entries => entries.map((entry: Partial<ProduccionEntity>, index: number) => ({ ...entry, id: index + 1 })));
    const entrada = {
      fecha: '2026-10-11',
      turno: 'MANANA',
      tipoProducto: 'Tabla',
      especie: 'Eucalipto',
      descripcionProducto: 'Tabla',
      unidadMedida: 'P2',
      unidadDimensiones: 'MILIMETROS',
      unidadResultado: 'P2',
      cantidadPaquetes: 1,
      piezasPorPaquete: 10,
      espesor: 25,
      ancho: 100,
      largo: 2000,
      aserradero: 'Otro',
    };

    await service.registrarEntradasMasivas({ entradas: [entrada] }, { rol: 'admin', aserradero: 'Norte' } as AuthenticatedUser);

    expect(produccionRepository.create).toHaveBeenCalledWith(expect.objectContaining({ aserradero: 'Norte' }));
  });

  it('permite corregir los campos del registro sin afectar otros paquetes del grupo', async () => {
    produccionRepository.findOneBy.mockResolvedValue(registro(1, 'Norte'));
    produccionRepository.update.mockResolvedValue({ affected: 1 });

    await service.actualizarRegistroStock(1, {
      especie: 'Eucalipto corregido',
      cantidadPaquetes: 7,
      piezasPorPaquete: 566,
      espesor: 18,
      ancho: 100,
      largo: 1200,
      observaciones: 'Mancha superficial',
    }, { rol: 'admin', aserradero: 'Norte' } as AuthenticatedUser);

    expect(produccionRepository.update).toHaveBeenCalledWith(1, expect.objectContaining({
      especie: 'Eucalipto corregido',
      cantidadPaquetes: 7,
      observaciones: 'Mancha superficial',
      aserradero: 'Norte',
    }));
  });

  it('permite eliminar un registro del aserradero asignado y bloquea los de otra planta', async () => {
    produccionRepository.findOneBy.mockResolvedValueOnce(registro(1, 'Norte'));

    await expect(service.eliminarRegistroStock(1, { rol: 'admin', aserradero: 'Norte' } as AuthenticatedUser))
      .resolves.toEqual({ deleted: 1 });
    expect(produccionRepository.delete).toHaveBeenCalledWith(1);

    produccionRepository.findOneBy.mockResolvedValueOnce(registro(2, 'Sur'));
    await expect(service.eliminarRegistroStock(2, { rol: 'admin', aserradero: 'Norte' } as AuthenticatedUser))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(produccionRepository.delete).toHaveBeenCalledTimes(1);
  });
});
