import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { CreateEmpleadoDto } from './dto/create-empleado.dto.js';
import { UpdateEmpleadoDto } from './dto/update-empleado.dto.js';
import { Empleado } from './entities/empleado.entity.js';
import { SueldoMensual } from './entities/sueldo-mensual.entity.js';
import { Usuario } from '../auth/entities/usuario.entity.js';
import { Aserradero } from '../aserraderos/entities/aserradero.entity.js';
import { AuthenticatedUser } from '../auth/auth.types.js';

@Injectable()
export class EmpleadosService {
  // Aquí le pedimos a NestJS que nos traiga la "herramienta de base de datos" para Empleados
  constructor(
    @InjectRepository(Empleado)
    private empleadoRepository: Repository<Empleado>,
    @InjectRepository(SueldoMensual)
    private sueldoMensualRepository: Repository<SueldoMensual>,
    @InjectRepository(Usuario)
    private usuarioRepository: Repository<Usuario>,
    @InjectRepository(Aserradero)
    private aserraderoRepository: Repository<Aserradero>,
  ) {}

  async create(createEmpleadoDto: CreateEmpleadoDto, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const { email, password, rolUsuario, aserradero, ...datosEmpleado } = createEmpleadoDto;
    const asignacion = await this.resolverAserradero(aserradero, user);
    const nuevoEmpleado = this.empleadoRepository.create({ ...datosEmpleado, aserradero: asignacion });
    const empleado = await this.empleadoRepository.save(nuevoEmpleado);
    try {
      await this.actualizarCuenta(empleado, rolUsuario, email, password, user);
    } catch (error) {
      await this.empleadoRepository.delete(empleado.id);
      throw error;
    }
    return this.findOne(empleado.id, user);
  }

  async findAll(user: AuthenticatedUser, aserraderoFiltro?: string) {
    this.validarAdmin(user);
    const aserradero = user.aserradero || aserraderoFiltro?.trim();
    if (!user.aserradero && aserradero && !await this.aserraderoRepository.findOneBy({ nombre: aserradero, activo: true })) {
      throw new NotFoundException('El aserradero solicitado no existe o está dado de baja.');
    }
    const empleados = await this.empleadoRepository.find(aserradero ? { where: { aserradero } } : {});
    await Promise.all(empleados.map((empleado) => this.ensureCurrentFixedSalary(empleado)));
    const actualizados = empleados.length
      ? await this.empleadoRepository.find({ where: { id: In(empleados.map(empleado => empleado.id)) } })
      : [];
    const usuarios = actualizados.length
      ? await this.usuarioRepository.find({ where: { empleadoId: In(actualizados.map(empleado => empleado.id)) } })
      : [];
    const cuentasPorEmpleado = new Map(usuarios.map(cuenta => [cuenta.empleadoId, cuenta]));
    return actualizados.map(empleado => ({ ...empleado, ...this.resumenCuenta(cuentasPorEmpleado.get(empleado.id)) }));
  }

  async findOne(id: number, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const empleado = await this.empleadoRepository.findOneBy({ id });
    if (!empleado || (user.aserradero && empleado.aserradero !== user.aserradero)) {
      throw new NotFoundException(`El empleado #${id} no existe en tu aserradero.`);
    }
    const cuenta = await this.usuarioRepository.findOneBy({ empleadoId: empleado.id });
    return { ...empleado, ...this.resumenCuenta(cuenta) };
  }

  async update(id: number, updateEmpleadoDto: UpdateEmpleadoDto, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const empleado = await this.empleadoRepository.findOneBy({ id });
    if (!empleado || (user.aserradero && empleado.aserradero !== user.aserradero)) {
      throw new NotFoundException(`El empleado #${id} no existe en tu aserradero.`);
    }
    const { email, password, rolUsuario, aserradero, ...datosEmpleado } = updateEmpleadoDto;
    const asignacion = await this.resolverAserradero(aserradero ?? empleado.aserradero, user);
    Object.assign(empleado, datosEmpleado, { aserradero: asignacion });
    await this.empleadoRepository.save(empleado);
    await this.actualizarCuenta(empleado, rolUsuario, email, password, user);
    return this.findOne(id, user);
  }

  async remove(id: number, user: AuthenticatedUser) {
    this.validarAdmin(user);
    const empleado = await this.empleadoRepository.findOneBy({ id });
    if (!empleado || (user.aserradero && empleado.aserradero !== user.aserradero)) {
      throw new NotFoundException(`El empleado #${id} no existe en tu aserradero.`);
    }
    const cuenta = await this.usuarioRepository.findOneBy({ empleadoId: id });
    if (cuenta) {
      cuenta.activo = false;
      await this.usuarioRepository.save(cuenta);
    }
    await this.empleadoRepository.delete(id);
    return { mensaje: `El empleado #${id} ha sido eliminado correctamente del sistema.` };
  }

  async updateFixedSalary(id: number, amount: number, applyTo: 'actual' | 'siguiente', user: AuthenticatedUser) {
    this.validarAdmin(user);
    const employee = await this.empleadoRepository.findOneBy({ id });
    if (!employee || (user.aserradero && employee.aserradero !== user.aserradero)) throw new NotFoundException(`El empleado #${id} no existe en tu aserradero.`);
    if (employee.tipoSalario !== 'FIJO') throw new BadRequestException('El empleado no tiene sueldo fijo.');
    if (!Number.isFinite(amount) || amount < 0) throw new BadRequestException('El sueldo debe ser un monto valido.');
    if (!['actual', 'siguiente'].includes(applyTo)) throw new BadRequestException('Periodo de aplicacion invalido.');

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const current = await this.ensureCurrentFixedSalary(employee);
    if (!current) throw new BadRequestException('No se pudo preparar el sueldo del mes actual.');
    if (applyTo === 'actual') {
      const assignedAmount = amount * Number(current.factorProrrateo || 1);
      const difference = assignedAmount - Number(current.sueldoAcreditado);
      if (difference !== 0) {
        employee.saldoPendiente = Number(employee.saldoPendiente) + difference;
        await this.empleadoRepository.save(employee);
        current.sueldoAcreditado = assignedAmount;
        current.sueldoAsignado = assignedAmount;
        await this.sueldoMensualRepository.save(current);
      }
      employee.sueldoFijo = amount;
      await this.empleadoRepository.save(employee);
      return { employee, difference, applyTo };
    }

    employee.sueldoFijo = amount;
    await this.empleadoRepository.save(employee);
    const nextDate = new Date(year, month, 1);
    const next = await this.sueldoMensualRepository.findOne({ where: { empleadoId: id, anio: nextDate.getFullYear(), mes: nextDate.getMonth() + 1 } });
    if (next) {
      next.sueldoAsignado = amount;
      await this.sueldoMensualRepository.save(next);
    } else {
      await this.sueldoMensualRepository.save(this.sueldoMensualRepository.create({ empleadoId: id, empleado: employee, anio: nextDate.getFullYear(), mes: nextDate.getMonth() + 1, sueldoAsignado: amount, sueldoAcreditado: 0 }));
    }
    return { employee, difference: 0, applyTo };
  }

  private validarAdmin(user: AuthenticatedUser) {
    if (user.rol !== 'admin') throw new ForbiddenException('Solo los administradores pueden gestionar empleados.');
  }

  private async resolverAserradero(solicitado: string | null | undefined, user: AuthenticatedUser) {
    const nombre = user.aserradero || solicitado?.trim() || null;
    if (user.aserradero && solicitado?.trim() && solicitado.trim() !== user.aserradero) {
      throw new ForbiddenException('No puedes asignar empleados a otro aserradero.');
    }
    if (nombre) {
      const aserradero = await this.aserraderoRepository.findOneBy({ nombre, activo: true });
      if (!aserradero) throw new BadRequestException('Selecciona un aserradero activo.');
    }
    return nombre;
  }

  private async actualizarCuenta(
    empleado: Empleado,
    rolUsuario: CreateEmpleadoDto['rolUsuario'] | UpdateEmpleadoDto['rolUsuario'],
    email: string | undefined,
    password: string | undefined,
    user: AuthenticatedUser,
  ) {
    const cuentaActual = await this.usuarioRepository.findOneBy({ empleadoId: empleado.id });
    if (rolUsuario === undefined) {
      if (cuentaActual?.activo) {
        if (cuentaActual.rol === 'admin' && cuentaActual.aserradero && !empleado.aserradero) {
          throw new BadRequestException('Asigna un aserradero o cambia el acceso a administrador general.');
        }
        if (cuentaActual.rol === 'admin' && cuentaActual.aserradero) cuentaActual.aserradero = empleado.aserradero;
        await this.usuarioRepository.save(cuentaActual);
      }
      return;
    }

    if (rolUsuario === 'sin_acceso') {
      if (cuentaActual) {
        cuentaActual.activo = false;
        await this.usuarioRepository.save(cuentaActual);
      }
      return;
    }

    if (!empleado.puesto.toLowerCase().includes('admin')) {
      throw new BadRequestException('El puesto debe ser administrativo para crear una cuenta administrativa.');
    }

    if (rolUsuario === 'admin_general' && user.aserradero) {
      throw new ForbiddenException('Solo un administrador general puede crear administradores generales.');
    }
    const aserraderoCuenta = rolUsuario === 'admin_general' ? null : empleado.aserradero;
    if (rolUsuario === 'admin_aserradero' && !aserraderoCuenta) {
      throw new BadRequestException('Asigna un aserradero antes de crear el usuario administrativo.');
    }
    const correo = email?.trim() || cuentaActual?.email;
    if (!correo || (!password && !cuentaActual)) {
      throw new BadRequestException('El correo y la contraseña son obligatorios para crear el acceso.');
    }
    const propietarioCorreo = await this.usuarioRepository.findOneBy({ email: correo });
    if (propietarioCorreo && propietarioCorreo.empleadoId !== empleado.id) {
      throw new ConflictException('Ese correo ya está vinculado a otro usuario.');
    }
    const passwordHash = password ? await bcrypt.hash(password, 10) : cuentaActual?.passwordHash;
    if (cuentaActual) {
      cuentaActual.email = correo;
      cuentaActual.passwordHash = passwordHash!;
      cuentaActual.rol = 'admin';
      cuentaActual.aserradero = aserraderoCuenta;
      cuentaActual.activo = true;
      await this.usuarioRepository.save(cuentaActual);
      return;
    }
    await this.usuarioRepository.save(this.usuarioRepository.create({
      email: correo,
      passwordHash: passwordHash!,
      rol: 'admin',
      empleadoId: empleado.id,
      aserradero: aserraderoCuenta,
      activo: true,
    }));
  }

  private resumenCuenta(cuenta?: Usuario | null) {
    if (!cuenta?.activo || cuenta.rol !== 'admin') return { rolUsuario: 'sin_acceso', email: '' };
    return {
      rolUsuario: cuenta.aserradero ? 'admin_aserradero' : 'admin_general',
      email: cuenta.email,
    };
  }

  private async ensureCurrentFixedSalary(employee: Empleado) {
    if (employee.tipoSalario !== 'FIJO') return null;
    const now = new Date();
    const anio = now.getFullYear();
    const mes = now.getMonth() + 1;
    let monthly = await this.sueldoMensualRepository.findOne({ where: { empleadoId: employee.id, anio, mes } });
    if (!monthly) {
      const factor = this.calculateCurrentMonthFactor(employee, anio, mes);
      monthly = this.sueldoMensualRepository.create({ empleadoId: employee.id, empleado: employee, anio, mes, factorProrrateo: factor, sueldoAsignado: Number(employee.sueldoFijo) * factor, sueldoAcreditado: 0 });
    }
    const pendingDifference = Number(monthly.sueldoAsignado) - Number(monthly.sueldoAcreditado);
    if (pendingDifference !== 0) {
      employee.saldoPendiente = Number(employee.saldoPendiente) + pendingDifference;
      monthly.sueldoAcreditado = Number(monthly.sueldoAsignado);
      await this.empleadoRepository.save(employee);
    }
    return this.sueldoMensualRepository.save(monthly);
  }

  private calculateCurrentMonthFactor(employee: Empleado, year: number, month: number) {
    if (!employee.fechaIngreso) return 1;
    const start = new Date(`${employee.fechaIngreso}T00:00:00`);
    if (start.getFullYear() !== year || start.getMonth() + 1 !== month) return 1;

    const daysInMonth = new Date(year, month, 0).getDate();
    const totalWeight = this.sumWorkdayWeights(employee, year, month, 1, daysInMonth);
    const firstDay = Math.min(daysInMonth, start.getDate());
    const remainingWeight = this.sumWorkdayWeights(employee, year, month, firstDay, daysInMonth);
    return totalWeight > 0 ? remainingWeight / totalWeight : 0;
  }

  private sumWorkdayWeights(employee: Empleado, year: number, month: number, fromDay: number, toDay: number) {
    let total = 0;
    for (let day = fromDay; day <= toDay; day++) {
      const date = new Date(year, month - 1, day);
      total += this.workdayWeight(employee, date.getDay());
    }
    return total;
  }

  private workdayWeight(employee: Empleado, dayOfWeek: number) {
    const day = ['DOMINGO', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'][dayOfWeek];
    if (employee.jornadaLaboral === 'LUNES_SABADO') return day === 'DOMINGO' ? 0 : 1;
    if (employee.jornadaLaboral === 'LUNES_SABADO_MEDIO') return day === 'SABADO' ? 0.5 : (day === 'DOMINGO' ? 0 : 1);
    if (employee.jornadaLaboral === 'TODOS_DIAS') return 1;
    if (employee.jornadaLaboral === 'PERSONALIZADA') return Number(employee.diasPersonalizados?.[day] ?? 0);
    return day === 'LUNES' || day === 'MARTES' || day === 'MIERCOLES' || day === 'JUEVES' || day === 'VIERNES' ? 1 : 0;
  }
}
