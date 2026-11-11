import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DbHardeningService } from './common/db-hardening.service.js';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard.js';
import { EmpleadosModule } from './empleados/empleados.module.js';
import { AdelantosModule } from './adelantos/adelantos.module.js';
import { PartesDiariosModule } from './partes-diarios/partes-diarios.module.js';
import { LiquidacionesModule } from './liquidaciones/liquidaciones.module.js';
import { AuthModule } from './auth/auth.module.js';
import { TurnosModule } from './turnos/turnos.module.js';
import { BackupsModule } from './backups/backups.module.js';
import { ProduccionModule } from './produccion/produccion.module.js';
import { AserraderosModule } from './aserraderos/aserraderos.module.js';
import { ClientesModule } from './clientes/clientes.module.js';
import { SalidasStockModule } from './salidas-stock/salidas-stock.module.js';
import { PedidosModule } from './pedidos/pedidos.module.js';
import { MaestrosRollosModule } from './maestros-rollos/maestros-rollos.module.js';
import { IngresoRollosModule } from './ingreso-rollos/ingreso-rollos.module.js';
import { CuentaCorrienteFleterosModule } from './cuenta-corriente-fleteros/cuenta-corriente-fleteros.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { ConteoPlayaRollosModule } from './conteo-playa-rollos/conteo-playa-rollos.module.js';
import { ConciliacionModule } from './conciliacion/conciliacion.module.js';
import { AreasModule } from './areas/areas.module.js';
import { RubrosModule } from './rubros/rubros.module.js';
import { ProveedoresModule } from './proveedores/proveedores.module.js';
import { GastosModule } from './gastos/gastos.module.js';
import { ReportesModule } from './reportes/reportes.module.js';
import { CierresModule } from './cierres/cierres.module.js';
import { LicensingModule } from './licensing/licensing.module.js';
import { UpdatesModule } from './updates/updates.module.js';

@Module({
  imports: [
    // Rate limiting global: 300 peticiones por minuto por IP (ajustado para cargas masivas controladas).
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 300,
      },
    ]),
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 5432),
      username: process.env.DB_USERNAME ?? 'admin',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME ?? 'erp_database',
      autoLoadEntities: true,
      // Seguridad: NUNCA sincronizar esquema automáticamente en producción (usar migraciones).
      // En no-producción solo si se habilita explícitamente (TYPEORM_SYNCHRONIZE=true).
      synchronize:
        process.env.NODE_ENV === 'production' ? false : process.env.TYPEORM_SYNCHRONIZE === 'true',
    }),
    EmpleadosModule,
    AdelantosModule,
    PartesDiariosModule,
    LiquidacionesModule,
    AuthModule,
    TurnosModule,
    BackupsModule,
    ProduccionModule,
    AserraderosModule,
    ClientesModule,
    SalidasStockModule,
    PedidosModule,
    MaestrosRollosModule,
    CuentaCorrienteFleterosModule,
    IngresoRollosModule,
    ConteoPlayaRollosModule,
    ConciliacionModule,
    DashboardModule,
    AreasModule,
    RubrosModule,
    ProveedoresModule,
    GastosModule,
    ReportesModule,
    CierresModule,
    LicensingModule,
    UpdatesModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    DbHardeningService,
    {
      provide: APP_GUARD,
      useClass: AppThrottlerGuard,
    },
  ],
})
export class AppModule {}