import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Dev hardening: TYPEORM_SYNCHRONIZE can drop unmanaged custom indexes on restart.
 * Reapplies idempotent index hardening (gastos fiscal + catalog normalized uniques).
 * Safe in all envs (IF NOT EXISTS / DROP+CREATE idempotent), targeted to known indexes.
 */
@Injectable()
export class DbHardeningService implements OnModuleInit {
  private readonly logger = new Logger(DbHardeningService.name);
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    // Run best-effort: never block app startup on hardening issues.
    try {
      await this.dataSource.query('DROP INDEX IF EXISTS uq_gastos_comprobantes_fiscal');
      await this.dataSource.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS uq_gastos_comprobantes_fiscal
          ON gastos_comprobantes (
            proveedor_id,
            tipo_comprobante,
            COALESCE(punto_venta, ''),
            numero_comprobante
          ) NULLS NOT DISTINCT
          WHERE tipo_comprobante NOT IN ('X', 'ACUSE', 'RECIBO', 'ORDEN')
            AND numero_comprobante IS NOT NULL
            AND btrim(numero_comprobante) <> ''
      `);
      await this.dataSource.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_areas_aserradero_nombre_norm ON areas (aserradero_id, lower(btrim(nombre)))',
      );
      await this.dataSource.query(
        'CREATE UNIQUE INDEX IF NOT EXISTS uq_rubros_nombre_norm ON rubros (lower(btrim(nombre)))',
      );
    } catch (e) {
      // Tables may not exist yet in some edge boot orders; synchronize/migrations will handle schema.
      this.logger.warn(`DB hardening (custom indexes) skipped: ${(e as Error)?.message || e}`);
    }
    // Reportes (aditivo, F1): índices para rangos/scope + columna aditiva pallets. Seguro con IF NOT EXISTS.
    try {
      await this.dataSource.query('ALTER TABLE IF EXISTS pallet_producciones_diarias ADD COLUMN IF NOT EXISTS "aserradero" varchar(120)');
      const rpt: string[] = [
        'CREATE INDEX IF NOT EXISTS idx_rpt_produccion_aserradero_fecha ON produccion ("aserradero", "fecha")',
        'CREATE INDEX IF NOT EXISTS idx_rpt_produccion_fecha ON produccion ("fecha")',
        'CREATE INDEX IF NOT EXISTS idx_rpt_salidas_aserradero_fecha ON salidas_stock ("aserradero", "fecha")',
        'CREATE INDEX IF NOT EXISTS idx_rpt_salidas_cliente_fecha ON salidas_stock ("clienteId", "fecha")',
        'CREATE INDEX IF NOT EXISTS idx_rpt_salidas_estado_despacho_fecha ON salidas_stock ("estadoDespacho", "fecha")',
        'CREATE INDEX IF NOT EXISTS idx_rpt_pedidos_aserradero_fecha ON pedidos ("aserradero", "fecha")',
        'CREATE INDEX IF NOT EXISTS idx_rpt_pedidos_cliente_fecha ON pedidos ("clienteId", "fecha")',
        'CREATE INDEX IF NOT EXISTS idx_rpt_pedidos_estado_fecha ON pedidos ("estado", "fecha")',
        'CREATE INDEX IF NOT EXISTS idx_rpt_partes_diarios_empleado_fecha ON partes_diarios ("empleadoId", "fecha")',
        'CREATE INDEX IF NOT EXISTS idx_rpt_partes_diarios_fecha ON partes_diarios ("fecha")',
        'CREATE INDEX IF NOT EXISTS idx_rpt_adelantos_empleado_fecha ON adelantos ("empleadoId", "fecha")',
        'CREATE INDEX IF NOT EXISTS idx_rpt_liquidaciones_empleado_fecha ON liquidaciones ("empleadoId", "fechaLiquidacion")',
        'CREATE INDEX IF NOT EXISTS idx_rpt_pallet_prod_fecha ON pallet_producciones_diarias ("fecha")',
        'CREATE INDEX IF NOT EXISTS idx_rpt_pallet_prod_aserradero_fecha ON pallet_producciones_diarias ("aserradero", "fecha")',
        'CREATE INDEX IF NOT EXISTS idx_rpt_pendientes_aserradero_fecha ON pendientes_produccion ("aserradero", "fecha")',
      ];
      for (const q of rpt) await this.dataSource.query(q);
    } catch (e) {
      this.logger.warn(`DB hardening (rpt indexes) skipped: ${(e as Error)?.message || e}`);
    }
  }
}
