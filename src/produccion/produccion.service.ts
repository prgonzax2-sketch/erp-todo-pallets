import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ProduccionEntity } from './entities/produccion.entity.js';
import { CreateProduccionEntradaDto, CreateProduccionMasivaDto } from './dto/produccion.dto.js';
import { AuthenticatedUser } from '../auth/auth.types.js';
import { Aserradero } from '../aserraderos/entities/aserradero.entity.js';

import { AprendizajePaquete } from './entities/aprendizaje-paquete.entity.js';
import { PalletRecipe } from './entities/pallet-recipe.entity.js';
import { PalletProduccionDiaria } from './entities/pallet-produccion.entity.js';
import { MesaPallet } from './entities/mesa-pallet.entity.js';
import { Empleado } from '../empleados/entities/empleado.entity.js';

@Injectable()
export class ProduccionService {
  private readonly logger = new Logger(ProduccionService.name);

  constructor(
    @InjectRepository(ProduccionEntity)
    private readonly produccionRepository: Repository<ProduccionEntity>,
    @InjectRepository(Aserradero)
    private readonly aserraderoRepository: Repository<Aserradero>,
    @InjectRepository(AprendizajePaquete)
    private readonly aprendizajeRepository: Repository<AprendizajePaquete>,
    @InjectRepository(PalletRecipe)
    private readonly palletRecipeRepository: Repository<PalletRecipe>,
    @InjectRepository(PalletProduccionDiaria)
    private readonly palletProdDiariaRepository: Repository<PalletProduccionDiaria>,
    @InjectRepository(MesaPallet)
    private readonly mesaPalletRepository: Repository<MesaPallet>,
    @InjectRepository(Empleado)
    private readonly empleadoRepository: Repository<Empleado>,
  ) {}

  async registrarEntrada(dto: CreateProduccionEntradaDto, user: AuthenticatedUser) {
    const [entrada] = await this.guardarEntradas([dto], user);
    return entrada;
  }

  async registrarEntradasMasivas(dto: CreateProduccionMasivaDto, user: AuthenticatedUser) {
    const { entradas } = dto;
    this.logger.log(`Registrando ${entradas.length} entradas masivas...`);
    const guardados = await this.guardarEntradas(entradas, user);
    this.logger.log(`Guardado exitoso de ${guardados.length} registros.`);
    return {
      count: guardados.length,
      message: 'Entradas procesadas correctamente',
    };
  }

  async listarStock(query: any, user: AuthenticatedUser) {
    this.logger.log(`Consultando stock con query: ${JSON.stringify(query)}`);
    this.validarAdministrador(user);

    try {
      const registros = await this.produccionRepository.find();
      const aserraderoFiltro = user.aserradero || String(query.aserradero || '').trim();
      const producciones = aserraderoFiltro
        ? registros.filter(record => record.aserradero === aserraderoFiltro)
        : registros;
      this.logger.log(`Registros encontrados en DB: ${producciones.length}`);

      if (!producciones || producciones.length === 0) {
        return [];
      }

      const matches = (value: unknown, filter: unknown) => !filter || String(value ?? '').toLowerCase().includes(String(filter).toLowerCase());
      const produccionesFiltradas = producciones.filter(p =>
        matches(p.especie, query.especie) && matches(p.observaciones, query.observaciones),
      );
      const stockAgrupado: Record<string, any> = {};
      const normalizarTexto = (valor: unknown) => String(valor ?? '').normalize('NFKC').trim().toLowerCase();
      const normalizarUnidad = (valor: unknown) => {
        const unidad = normalizarTexto(valor);
        return ['mm', 'milimetros', 'milímetros'].includes(unidad) ? 'mm' : unidad;
      };

      const disponiblePaquetes = (p: any) => Math.max(0, Number(p.cantidadPaquetes || 0) - Number(p.cantidadReservada || 0));

      produccionesFiltradas.forEach(p => {
        const producto = p.descripcionProducto?.split(' - ')[0]?.trim() || p.tipoProducto?.trim();
        const observacionesRegistro = p.observaciones?.trim() || p.descripcionProducto?.split(' - ').slice(1).join(' - ').trim() || '';
        const lote = p.lote || `L-${p.id}`;
        const normalizarComponentes = (componentes: any[]) =>
          (componentes || []).map(componente => ({
            medida: {
              espesor: Number(componente.medida?.espesor) || 0,
              ancho: Number(componente.medida?.ancho) || 0,
              largo: Number(componente.medida?.largo) || 0,
            },
            cantidad: Number(componente.cantidad) || 0,
          })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
        const separadores = normalizarComponentes(p.separadores);
        const tacos = normalizarComponentes(p.tacos);
        const key = JSON.stringify([
          normalizarTexto(p.tipoProducto),
          normalizarTexto(producto),
          normalizarTexto(p.especie),
          Number(p.piezasPorPaquete || 0),
          Number(p.espesor || 0),
          Number(p.ancho || 0),
          Number(p.largo || 0),
          normalizarUnidad(p.unidadDimensiones),
          separadores,
          tacos,
        ]);

        if (!stockAgrupado[key]) {
          stockAgrupado[key] = {
            ids: [],
            lote,
            lotesPorNombre: new Map<string, { aserradero: string; lote: string; ids: number[] }>(),
            aserraderosPorNombre: new Map<string, { aserradero: string; paquetesDisponibles: number; piezasDisponibles: number; lotesPorNombre: Map<string, number[]> }>(),
            producto,
            descripcionProducto: p.descripcionProducto,
            especie: p.especie,
            observaciones: new Set<string>(),
            espesorReal: Number(p.espesor),
            anchoReal: Number(p.ancho),
            largoReal: Number(p.largo),
            unidadDimensiones: p.unidadDimensiones,
            piezasPorPaquete: Number(p.piezasPorPaquete || 0),
            cantidadPaquetes: 0,
            cantidadReservada: 0,
            paquetesDisponibles: 0,
            piezasDisponibles: 0,
            registros: [],
            separadores,
            tacos,
            tagsPorNombre: new Map<string, { nombre: string }>()
          };
        }

        const item = stockAgrupado[key];
        const disp = disponiblePaquetes(p);
        const reservada = Math.max(0, Number(p.cantidadReservada || 0));
        item.ids.push(p.id);
        item.cantidadPaquetes += Number(p.cantidadPaquetes || 0);
        item.cantidadReservada += reservada;
        item.paquetesDisponibles += disp;
        item.piezasDisponibles += disp * Number(p.piezasPorPaquete || 0);
        const aserradero = p.aserradero || 'Sin asignar';
        if (!item.aserraderosPorNombre.has(aserradero)) {
          item.aserraderosPorNombre.set(aserradero, {
            aserradero,
            paquetesDisponibles: 0,
            piezasDisponibles: 0,
            lotesPorNombre: new Map<string, number[]>(),
          });
        }
        const stockAserradero = item.aserraderosPorNombre.get(aserradero);
        stockAserradero.paquetesDisponibles += disp;
        stockAserradero.piezasDisponibles += disp * Number(p.piezasPorPaquete || 0);
        if (!stockAserradero.lotesPorNombre.has(lote)) stockAserradero.lotesPorNombre.set(lote, []);
        stockAserradero.lotesPorNombre.get(lote).push(p.id);
        item.registros.push({
          id: p.id,
          fecha: p.fecha,
          turno: p.turno,
          tipoProducto: p.tipoProducto,
          descripcionProducto: p.descripcionProducto,
          aserradero: p.aserradero,
          lote: p.lote || lote,
          especie: p.especie,
          observaciones: observacionesRegistro,
          unidadMedida: p.unidadMedida,
          unidadDimensiones: p.unidadDimensiones,
          unidadResultado: p.unidadResultado,
          cantidadPaquetes: Number(p.cantidadPaquetes || 0),
          cantidadReservada: reservada,
          disponible: disp,
          piezasPorPaquete: Number(p.piezasPorPaquete || 0),
          espesor: Number(p.espesor || 0),
          ancho: Number(p.ancho || 0),
          largo: Number(p.largo || 0),
          separadores: p.separadores || [],
          tacos: p.tacos || [],
          tags: p.tags || [],
        });
        const loteKey = JSON.stringify([aserradero, lote]);
        if (!item.lotesPorNombre.has(loteKey)) item.lotesPorNombre.set(loteKey, { aserradero, lote, ids: [] });
        item.lotesPorNombre.get(loteKey).ids.push(p.id);
        if (observacionesRegistro) item.observaciones.add(observacionesRegistro);
        p.tags?.forEach(tag => {
          if (tag?.nombre) item.tagsPorNombre.set(tag.nombre, { nombre: tag.nombre });
        });
      });

      return Object.values(stockAgrupado).map((item: any) => {
        const lotes = [...item.lotesPorNombre.values()];
        const aserraderos = [...item.aserraderosPorNombre.values()].map(stockAserradero => ({
          aserradero: stockAserradero.aserradero,
          paquetesDisponibles: stockAserradero.paquetesDisponibles,
          piezasDisponibles: stockAserradero.piezasDisponibles,
          lotes: [...stockAserradero.lotesPorNombre.entries()].map(([lote, ids]) => ({ lote, ids })),
        }));
        const observaciones = [...item.observaciones].join('; ');
        const tags = [...item.tagsPorNombre.values()];
        delete item.lotesPorNombre;
        delete item.aserraderosPorNombre;
        delete item.observaciones;
        delete item.tagsPorNombre;
        return {
          ...item,
          lote: lotes.length === 1 ? lotes[0].lote : `Varios (${lotes.length})`,
          aserradero: aserraderos.length === 1 ? aserraderos[0].aserradero : `Varios (${aserraderos.length})`,
          lotes,
          aserraderos,
          observaciones,
          tags,
        };
      }).filter(item => {
        return matches(item.especie, query.especie)
          && matches(item.observaciones, query.observaciones)
          && matches(item.producto, query.producto || query.tipoProducto)
          && matches(item.espesorReal, query.espesor)
          && matches(item.anchoReal, query.ancho)
          && matches(item.largoReal, query.largo)
          && matches(item.tags.map((tag: { nombre?: string }) => tag.nombre || '').join(' '), query.tags);
      });
    } catch (error: any) {
      this.logger.error(`Error al listar stock: ${error.message}`);
      throw error;
    }
  }

  async actualizarLote(ids: number[], lote: string, aserradero: string, user: AuthenticatedUser) {
    this.validarAdministrador(user);
    if (user.aserradero) throw new ForbiddenException('Solo un administrador general puede editar lotes.');
    const nuevoLote = lote?.trim();
    const nuevoAserradero = aserradero?.trim();
    if (!Array.isArray(ids) || ids.length === 0 || !nuevoLote || !nuevoAserradero) {
      throw new BadRequestException('Debes indicar registros, un lote y un aserradero válidos.');
    }
    if (!await this.aserraderoRepository.findOneBy({ nombre: nuevoAserradero, activo: true })) {
      throw new BadRequestException('El aserradero indicado no existe o está dado de baja.');
    }
    const resultado = await this.produccionRepository.update({ id: In(ids) }, { lote: nuevoLote, aserradero: nuevoAserradero });
    if (!resultado.affected) throw new NotFoundException('No se encontraron registros para actualizar.');
    return { updated: resultado.affected, lote: nuevoLote, aserradero: nuevoAserradero };
  }

  async actualizarObservaciones(ids: number[], observaciones: string, user: AuthenticatedUser) {
    this.validarAdministrador(user);
    const idsUnicos = [...new Set(ids)];
    if (!idsUnicos.length || idsUnicos.some(id => !Number.isInteger(id) || id <= 0)) {
      throw new BadRequestException('Debes indicar los registros de stock a actualizar.');
    }
    const registros = await this.produccionRepository.find({ where: { id: In(idsUnicos) } });
    if (registros.length !== idsUnicos.length) throw new NotFoundException('No se encontraron todos los registros de stock.');
    if (user.aserradero && registros.some(registro => registro.aserradero !== user.aserradero)) {
      throw new ForbiddenException('No puedes editar observaciones de otro aserradero.');
    }
    const nuevasObservaciones = String(observaciones ?? '').trim();
    await this.produccionRepository.update({ id: In(idsUnicos) }, { observaciones: nuevasObservaciones });
    return { updated: idsUnicos.length, observaciones: nuevasObservaciones };
  }

  async actualizarRegistroStock(id: number, cambios: Partial<CreateProduccionEntradaDto>, user: AuthenticatedUser) {
    this.validarAdministrador(user);
    const registro = await this.produccionRepository.findOneBy({ id });
    if (!registro) throw new NotFoundException(`El registro de stock #${id} no existe.`);
    if (user.aserradero && registro.aserradero !== user.aserradero) {
      throw new ForbiddenException('No puedes editar stock de otro aserradero.');
    }

    const reservada = Math.max(0, Number(registro.cantidadReservada || 0));
    if (reservada > 0) {
      const tocaCantidad = Object.prototype.hasOwnProperty.call(cambios, 'cantidadPaquetes');
      const tocaMedida = ['espesor', 'ancho', 'largo', 'piezasPorPaquete', 'separadores', 'tacos', 'especie', 'descripcionProducto', 'tipoProducto', 'unidadDimensiones'].some(c => Object.prototype.hasOwnProperty.call(cambios, c));
      if (tocaMedida) {
        throw new BadRequestException(`No puedes editar medidas/producto del registro #${id} porque tiene ${reservada} paquete(s) reservado(s) para pedidos.`);
      }
      if (tocaCantidad) {
        const nueva = Number(cambios.cantidadPaquetes);
        if (Number.isFinite(nueva) && nueva < reservada) {
          throw new BadRequestException(`No puedes dejar ${nueva} paquetes físicos con ${reservada} reservado(s). Libera reservas primero.`);
        }
      }
    }

    const permitidos: (keyof CreateProduccionEntradaDto)[] = [
      'fecha', 'turno', 'tipoProducto', 'descripcionProducto', 'especie', 'observaciones',
      'unidadMedida', 'unidadDimensiones', 'unidadResultado', 'cantidadPaquetes',
      'piezasPorPaquete', 'espesor', 'ancho', 'largo', 'separadores', 'tacos', 'tags', 'lote', 'aserradero',
    ];
    const actualizacion: Record<string, any> = {};
    permitidos.forEach(campo => {
      if (Object.prototype.hasOwnProperty.call(cambios, campo)) actualizacion[campo] = cambios[campo];
    });
    if (user.aserradero) {
      if (Object.prototype.hasOwnProperty.call(actualizacion, 'lote') && actualizacion.lote !== registro.lote) {
        throw new ForbiddenException('Solo un administrador general puede editar lotes.');
      }
      if (actualizacion.aserradero && actualizacion.aserradero !== user.aserradero) {
        throw new ForbiddenException('No puedes trasladar stock a otro aserradero.');
      }
      delete actualizacion.lote;
      actualizacion.aserradero = user.aserradero;
    } else if (actualizacion.aserradero && !await this.aserraderoRepository.findOneBy({ nombre: actualizacion.aserradero, activo: true })) {
      throw new BadRequestException('El aserradero indicado no existe o está dado de baja.');
    }
    if (!Object.keys(actualizacion).length) throw new BadRequestException('No hay campos de stock para actualizar.');
    for (const campo of ['cantidadPaquetes', 'piezasPorPaquete', 'espesor', 'ancho', 'largo']) {
      if (actualizacion[campo] !== undefined && (!Number.isFinite(Number(actualizacion[campo])) || Number(actualizacion[campo]) <= 0)) {
        throw new BadRequestException(`${campo} debe ser mayor que cero.`);
      }
      if (actualizacion[campo] !== undefined) actualizacion[campo] = Number(actualizacion[campo]);
    }
    for (const campo of ['separadores', 'tacos', 'tags']) {
      if (actualizacion[campo] !== undefined && !Array.isArray(actualizacion[campo])) {
        throw new BadRequestException(`${campo} debe ser una lista.`);
      }
    }
    await this.produccionRepository.update(id, actualizacion);
    return this.produccionRepository.findOneBy({ id });
  }

  async eliminarRegistroStock(id: number, user: AuthenticatedUser) {
    this.validarAdministrador(user);
    const registro = await this.produccionRepository.findOneBy({ id });
    if (!registro) throw new NotFoundException(`El registro de stock #${id} no existe.`);
    if (user.aserradero && registro.aserradero !== user.aserradero) {
      throw new ForbiddenException('No puedes eliminar stock de otro aserradero.');
    }
    const reservada = Math.max(0, Number(registro.cantidadReservada || 0));
    if (reservada > 0) {
      throw new BadRequestException(`No puedes eliminar el registro #${id} porque tiene ${reservada} paquete(s) reservado(s) para pedidos.`);
    }
    await this.produccionRepository.delete(id);
    return { deleted: id };
  }

  private validarAdministrador(user: AuthenticatedUser) {
    if (user.rol !== 'admin') throw new ForbiddenException('Solo los administradores pueden gestionar producción.');
  }

  private async guardarEntradas(entradas: CreateProduccionEntradaDto[], user: AuthenticatedUser) {
    this.validarAdministrador(user);
    const registros = entradas.map(entrada => {
      const aserradero = user.aserradero?.trim() || entrada.aserradero?.trim();
      if (!aserradero) throw new BadRequestException('Debes indicar el aserradero de la producción.');
      return this.produccionRepository.create({
        ...entrada,
        aserradero,
        lote: entrada.lote?.trim() || undefined,
      });
    });

    for (const entrada of registros) {
      if (!await this.aserraderoRepository.findOneBy({ nombre: entrada.aserradero, activo: true })) {
        throw new BadRequestException(`El aserradero ${entrada.aserradero} no existe o está dado de baja.`);
      }
    }

    const guardados = await this.produccionRepository.save(registros);
    const sinLote = guardados.filter(entrada => !entrada.lote).map(entrada => ({ ...entrada, lote: `L-${entrada.id}` }));
    if (sinLote.length) await this.produccionRepository.save(sinLote);
    return guardados.map(entrada => sinLote.find(updated => updated.id === entrada.id) || entrada);
  }

  async listarTags() {
    const producciones = await this.produccionRepository.find();
    const tags = new Set<string>();
    producciones.forEach(p => {
      p.tags?.forEach(t => tags.add(t.nombre));
    });
    return Array.from(tags).map(nombre => ({ nombre }));
  }

  async learnPaquete(data: { espesor: number; ancho: number; largo: number; especie?: string; piezasPorPaquete: number; separadores: any[]; tacos: any[] }) {
    const exists = await this.aprendizajeRepository.findOneBy({
      espesor: data.espesor,
      ancho: data.ancho,
      largo: data.largo,
      ...(data.especie ? { especie: data.especie } : {}),
    });
    if (exists) {
      exists.piezasPorPaquete = data.piezasPorPaquete;
      exists.separadores = data.separadores;
      exists.tacos = data.tacos;
      exists.vecesUsado += 1;
      return this.aprendizajeRepository.save(exists);
    }
    const entity = this.aprendizajeRepository.create({
      espesor: data.espesor,
      ancho: data.ancho,
      largo: data.largo,
      especie: data.especie,
      piezasPorPaquete: data.piezasPorPaquete,
      separadores: data.separadores,
      tacos: data.tacos,
      vecesUsado: 1,
    });
    return this.aprendizajeRepository.save(entity);
  }

  async suggestPaquete(query: any) {
    const espesor = Number(query.espesor);
    const ancho = Number(query.ancho);
    const largo = Number(query.largo);
    const especie = query.especie ? String(query.especie).trim() : undefined;

    const qb = this.aprendizajeRepository.createQueryBuilder('ap')
      .where('ap.espesor = :espesor', { espesor })
      .andWhere('ap.ancho = :ancho', { ancho })
      .andWhere('ap.largo = :largo', { largo });

    if (especie) qb.andWhere('ap.especie = :especie', { especie });

    const found = await qb.getMany();
    if (found.length) {
      return found[0];
    }
    return null;
  }

  async crearRecetaPallet(body: any) {
    const entity = this.palletRecipeRepository.create(body);
    return this.palletRecipeRepository.save(entity);
  }

  async listarRecetasPallet() {
    return this.palletRecipeRepository.find({ order: { nombre: 'ASC' } });
  }

  async eliminarRecetaPallet(id: number) {
    return this.palletRecipeRepository.delete(id);
  }

  async actualizarRecetaPallet(id: number, body: any) {
    await this.palletRecipeRepository.update(id, body);
    return this.palletRecipeRepository.findOneBy({ id });
  }

  async obtenerRecetaPallet(id: number) {
    return this.palletRecipeRepository.findOneBy({ id });
  }

  async registrarProduccionPalletDiaria(body: { palletId: number; cantidad: number; tarifaManoObra?: number; aserradero?: string; mesaId?: number; operarioIds?: number[] }, user: AuthenticatedUser) {
    const palletRecipe = await this.palletRecipeRepository.findOneBy({ id: body.palletId });
    if (!palletRecipe) {
      throw new BadRequestException('Pallet no encontrado');
    }

    const cantidadTotal = Number(body.cantidad);
    if (!Number.isFinite(cantidadTotal) || cantidadTotal <= 0) {
      throw new BadRequestException('La cantidad debe ser mayor que cero.');
    }

    const aserradero = user.aserradero || body.aserradero;
    if (!aserradero) {
      throw new BadRequestException('Debes indicar el aserradero de la producción');
    }

    const fecha = new Date().toISOString().split('T')[0];
    const tarifa = Number(body.tarifaManoObra ?? 0);

    // Determinar integrantes para reparto automático (mesaId o lista explícita)
    let mesa: MesaPallet | null = null;
    let integranteIds: number[] = [];
    if (body.mesaId) {
      mesa = await this.mesaPalletRepository.findOneBy({ id: Number(body.mesaId) });
      if (!mesa) throw new NotFoundException(`Mesa #${body.mesaId} no encontrada.`);
      if (mesa.activo === false) throw new BadRequestException('La mesa seleccionada está inactiva.');
      if (user.aserradero && mesa.aserradero && mesa.aserradero !== user.aserradero) {
        throw new ForbiddenException('No puedes usar una mesa de otro aserradero.');
      }
      if (mesa.aserradero && mesa.aserradero !== aserradero) {
        // admin general puede registrar en aserradero objetivo; mesa debe corresponder si está acotada
        // permitimos si admin general, pero mantenemos coherencia: si mesa tiene aserradero, debe coincidir
        throw new BadRequestException('La mesa no pertenece al aserradero indicado.');
      }
      integranteIds = Array.isArray(mesa.integranteIds) ? mesa.integranteIds.map(Number).filter((n) => Number.isFinite(n)) : [];
    } else if (Array.isArray(body.operarioIds) && body.operarioIds.length) {
      integranteIds = body.operarioIds.map(Number).filter((n) => Number.isFinite(n));
    }
    integranteIds = [...new Set(integranteIds)];

    // Si no hay reparto, comportamiento legacy (un registro)
    if (!integranteIds.length) {
      const palletDiaria = this.palletProdDiariaRepository.create({
        palletId: body.palletId,
        cantidad: Math.trunc(cantidadTotal),
        tarifaManoObra: tarifa,
        fecha: fecha as any,
        aserradero,
      });
      await this.palletProdDiariaRepository.save(palletDiaria);

      const produccion = this.produccionRepository.create({
        fecha,
        turno: 'UNICO',
        tipoProducto: palletRecipe.nombre,
        especie: palletRecipe.especieMadera,
        descripcionProducto: palletRecipe.nombre,
        aserradero,
        lote: `PAL-${Date.now()}`,
        observaciones: `Producción diaria de pallet: ${palletRecipe.nombre}`,
        unidadMedida: 'UNIDADES',
        unidadDimensiones: 'UNIDADES',
        unidadResultado: 'UNIDADES',
        cantidadPaquetes: 1,
        piezasPorPaquete: Math.trunc(cantidadTotal),
        espesor: 0,
        ancho: 0,
        largo: 0,
        separadores: [],
        tacos: [],
        tags: [],
      });
      await this.produccionRepository.save(produccion);

      return { ...palletDiaria, reparto: null, total: Math.trunc(cantidadTotal) };
    }

    // Cargar y validar operarios
    const empleados = await this.empleadoRepository.find({ where: { id: In(integranteIds) } });
    const empById = new Map(empleados.map((e) => [Number(e.id), e]));
    const faltantes = integranteIds.filter((id) => !empById.has(id));
    if (faltantes.length) {
      throw new NotFoundException(`Operario(s) no encontrados: ${faltantes.join(', ')}`);
    }
    for (const id of integranteIds) {
      const emp = empById.get(id)!;
      if (user.aserradero && emp.aserradero !== user.aserradero) {
        throw new ForbiddenException(`El operario #${id} no pertenece a tu aserradero.`);
      }
      if (emp.aserradero && emp.aserradero !== aserradero) {
        throw new BadRequestException(`El operario ${emp.nombreCompleto || id} no pertenece al aserradero ${aserradero}.`);
      }
    }

    // Reparto automático equitativo (ej. 150 entre 2 => 75/75; resto al inicio)
    const total = Math.trunc(cantidadTotal);
    const n = integranteIds.length;
    const base = Math.floor(total / n);
    let resto = total % n;
    if (base <= 0 && total > 0) {
      throw new BadRequestException('La cantidad es insuficiente para repartir entre los operarios indicados.');
    }

    const reparto: Array<{ empleadoId: number; empleadoNombre: string; cantidad: number; palletProduccionId: number | null }> = [];
    const detalles: PalletProduccionDiaria[] = [];
    for (let i = 0; i < n; i++) {
      const empId = integranteIds[i];
      const emp = empById.get(empId)!;
      const asignado = base + (resto > 0 ? 1 : 0);
      if (resto > 0) resto -= 1;

      const palletDiaria = this.palletProdDiariaRepository.create({
        palletId: body.palletId,
        cantidad: asignado,
        tarifaManoObra: tarifa,
        fecha: fecha as any,
        aserradero,
        mesaId: mesa?.id ?? null,
        empleadoId: empId,
        empleadoNombre: emp.nombreCompleto || null,
      });
      const saved = await this.palletProdDiariaRepository.save(palletDiaria);
      detalles.push(saved);
      reparto.push({ empleadoId: empId, empleadoNombre: emp.nombreCompleto || String(empId), cantidad: asignado, palletProduccionId: saved.id });
    }

    // Stock/producción agregada (un registro resumen por reparto) para mantener inventario consistente
    const observaciones = mesa
      ? `Producción diaria de pallet: ${palletRecipe.nombre} (Mesa ${mesa.nombre}, reparto ${reparto.map(r => `${r.empleadoNombre}:${r.cantidad}`).join(', ')})`
      : `Producción diaria de pallet: ${palletRecipe.nombre} (Reparto ${reparto.map(r => `${r.empleadoNombre}:${r.cantidad}`).join(', ')})`;
    const produccion = this.produccionRepository.create({
      fecha,
      turno: 'UNICO',
      tipoProducto: palletRecipe.nombre,
      especie: palletRecipe.especieMadera,
      descripcionProducto: palletRecipe.nombre,
      aserradero,
      lote: `PAL-${Date.now()}`,
      observaciones,
      unidadMedida: 'UNIDADES',
      unidadDimensiones: 'UNIDADES',
      unidadResultado: 'UNIDADES',
      cantidadPaquetes: 1,
      piezasPorPaquete: total,
      espesor: 0,
      ancho: 0,
      largo: 0,
      separadores: [],
      tacos: [],
      tags: [],
    });
    await this.produccionRepository.save(produccion);

    return {
      total,
      palletId: body.palletId,
      aserradero,
      mesaId: mesa?.id ?? null,
      reparto,
      registros: detalles,
      message: `Producción registrada y repartida automáticamente entre ${n} operario(s).`,
    };
  }

  // --- Mesas de pallets ---
  async crearMesaPallet(body: any, user: AuthenticatedUser) {
    this.validarAdministrador(user);
    const aserradero = user.aserradero || body.aserradero || null;
    if (!body?.nombre || !String(body.nombre).trim()) throw new BadRequestException('El nombre de la mesa es obligatorio.');
    const integranteIds = Array.isArray(body.integranteIds) ? body.integranteIds.map(Number).filter((n: number) => Number.isFinite(n)) : [];
    if (integranteIds.length < 1) throw new BadRequestException('La mesa debe tener al menos un integrante.');
    if (aserradero && !await this.aserraderoRepository.findOneBy({ nombre: aserradero, activo: true })) {
      throw new BadRequestException('El aserradero indicado no existe o está dado de baja.');
    }
    await this.validarIntegrantesMesa(integranteIds, aserradero, user);
    const mesa = this.mesaPalletRepository.create({
      nombre: String(body.nombre).trim(),
      aserradero,
      integranteIds,
      activo: body.activo !== false,
    });
    return this.mesaPalletRepository.save(mesa);
  }

  async listarMesasPallet(aserradero: string | undefined, user: AuthenticatedUser) {
    this.validarAdministrador(user);
    const scope = user.aserradero || aserradero;
    const where: any = {};
    if (scope) where.aserradero = scope;
    return this.mesaPalletRepository.find({ where, order: { nombre: 'ASC' } });
  }

  async obtenerMesaPallet(id: number, user: AuthenticatedUser) {
    this.validarAdministrador(user);
    const mesa = await this.mesaPalletRepository.findOneBy({ id });
    if (!mesa) throw new NotFoundException(`Mesa #${id} no encontrada.`);
    if (user.aserradero && mesa.aserradero !== user.aserradero) throw new ForbiddenException('No puedes ver mesas de otro aserradero.');
    return mesa;
  }

  async actualizarMesaPallet(id: number, body: any, user: AuthenticatedUser) {
    this.validarAdministrador(user);
    const mesa = await this.obtenerMesaPallet(id, user);
    if (Object.prototype.hasOwnProperty.call(body, 'nombre') && !String(body.nombre || '').trim()) {
      throw new BadRequestException('El nombre de la mesa es obligatorio.');
    }
    const integranteIds = Object.prototype.hasOwnProperty.call(body, 'integranteIds')
      ? (Array.isArray(body.integranteIds) ? body.integranteIds.map(Number).filter((n: number) => Number.isFinite(n)) : [])
      : mesa.integranteIds;
    if (Object.prototype.hasOwnProperty.call(body, 'integranteIds') && integranteIds.length < 1) {
      throw new BadRequestException('La mesa debe tener al menos un integrante.');
    }
    const aserradero = Object.prototype.hasOwnProperty.call(body, 'aserradero')
      ? (user.aserradero || body.aserradero || null)
      : (user.aserradero || mesa.aserradero || null);
    if (user.aserradero && aserradero !== user.aserradero) throw new ForbiddenException('No puedes mover mesas a otro aserradero.');
    await this.validarIntegrantesMesa(integranteIds, aserradero, user);
    Object.assign(mesa, {
      nombre: Object.prototype.hasOwnProperty.call(body, 'nombre') ? String(body.nombre).trim() : mesa.nombre,
      aserradero,
      integranteIds,
      activo: Object.prototype.hasOwnProperty.call(body, 'activo') ? !!body.activo : mesa.activo,
    });
    return this.mesaPalletRepository.save(mesa);
  }

  async eliminarMesaPallet(id: number, user: AuthenticatedUser) {
    this.validarAdministrador(user);
    const mesa = await this.obtenerMesaPallet(id, user);
    await this.mesaPalletRepository.delete(mesa.id);
    return { deleted: id };
  }

  private async validarIntegrantesMesa(integranteIds: number[], aserradero: string | null, user: AuthenticatedUser) {
    const uniq = [...new Set(integranteIds)];
    if (!uniq.length) throw new BadRequestException('La mesa debe tener al menos un integrante.');
    const empleados = await this.empleadoRepository.find({ where: { id: In(uniq) } });
    if (empleados.length !== uniq.length) {
      const found = new Set(empleados.map((e) => e.id));
      const faltantes = uniq.filter((id) => !found.has(id));
      throw new NotFoundException(`Integrante(s) no encontrados: ${faltantes.join(', ')}`);
    }
    const scope = user.aserradero || aserradero;
    if (scope) {
      const fuera = empleados.filter((e) => e.aserradero !== scope);
      if (fuera.length) throw new BadRequestException('Todos los integrantes deben pertenecer al aserradero de la mesa.');
    }
  }
}
