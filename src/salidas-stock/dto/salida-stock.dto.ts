import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Legacy item (compat). */
export class SalidaItemDto {
  @IsNumber()
  produccionId: number;

  @IsNumber()
  @Min(0.0001)
  paquetesDespachados: number;

  @IsOptional()
  @IsNumber()
  piezasDespachadas?: number;

  @IsOptional()
  @IsString()
  medidaRemito?: string;

  // A1 financieros opcionales (compat)
  @IsOptional() @IsNumber() @Min(0) precioUnitario?: number;
  @IsOptional() @IsNumber() @Min(0) alicuotaIva?: number;
  @IsOptional() @IsIn(['P2', 'TN', 'M2', 'UNIDAD']) unidadPrecio?: string;
  @IsOptional() @IsNumber() @Min(0) m2?: number;
}

/** Detalle normalizado A1 (madera directa o subproducto/báscula). */
export class VentaDetalleDto {
  @IsOptional() @IsIn(['MADERA_PAQUETE', 'SUBPRODUCTO', 'OTRO']) tipoRenglon?: string;
  @IsOptional() @IsNumber() produccionId?: number;
  @IsOptional() @IsNumber() pedidoAsignacionId?: number;
  @IsOptional() @IsIn(['ASERRIN', 'CHIP']) subproductoTipo?: string;
  @IsOptional() @IsString() @MaxLength(30) especieDeclarada?: string;
  @IsOptional() @IsString() @MaxLength(120) productoEspecie?: string;
  @IsOptional() @IsString() @MaxLength(300) detalle?: string;
  @IsOptional() @IsString() @MaxLength(300) descripcion?: string; // compat: algunos clientes envían descripcion
  @IsOptional() @IsString() @MaxLength(120) medidaTexto?: string;

  @IsOptional() @IsNumber() @Min(0.0001) cantidad?: number; // paquetes/uds
  @IsOptional() @IsNumber() @Min(0) piezas?: number;
  @IsOptional() @IsNumber() @Min(0) p2?: number;
  @IsOptional() @IsNumber() @Min(0) m2?: number;
  @IsOptional() @IsNumber() @Min(0) toneladas?: number;
  @IsOptional() @IsNumber() @Min(0) tnProvisionales?: number;
  @IsOptional() @IsNumber() @Min(0) tnReales?: number;

  @IsOptional() @IsIn(['P2', 'TN', 'M2', 'UNIDAD']) unidadPrecio?: string;
  @IsOptional() @IsNumber() @Min(0) precioUnitario?: number;
  @IsOptional() @IsNumber() @Min(0) alicuotaIva?: number;
  @IsOptional() @IsString() observaciones?: string;
}

/** Compat legacy + A1. Si vienen `detalles`/campos financieros se usa flujo A1; `items` mantiene compat. */
export class CreateSalidaStockDto {
  @IsOptional() @IsString() fecha?: string;
  @IsOptional() @IsString() aserradero?: string;

  @IsOptional() @IsNumber() clienteId?: number;
  @IsString()
  @MaxLength(200)
  clienteNombre: string;
  @IsOptional() @IsString() clienteCuitDni?: string;
  @IsOptional() @IsString() telefono?: string;
  @IsOptional() @IsString() direccion?: string;

  @IsOptional() @IsNumber() @Min(0) cantidadSolicitada?: number;
  @IsOptional() @IsString() medidaSolicitada?: string;
  @IsOptional() @IsString() observaciones?: string;

  // A1 cabecera
  @IsOptional() @IsNumber() pedidoId?: number;
  @IsOptional() @IsString() @MaxLength(80) remitoFisicoNumero?: string;
  @IsOptional() @IsString() @MaxLength(40) tipoComprobante?: string;
  @IsOptional() @IsString() @MaxLength(80) facturaNumero?: string;
  @IsOptional() @IsString() @MaxLength(200) transporte?: string;
  @IsOptional() @IsIn(['LEGACY', 'PEDIDO', 'DIRECTA_MADERA', 'DIRECTA_SUBPRODUCTO']) origenTipo?: string;
  @IsOptional() @IsNumber() @Min(0) alicuotaIvaDefault?: number; // override cabecera (si sin cliente)

  /** Legacy compat */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalidaItemDto)
  items?: SalidaItemDto[];

  /** A1 detalles normalizados (directa madera / subproducto) */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VentaDetalleDto)
  detalles?: VentaDetalleDto[];

  @IsOptional() @IsBoolean() pendienteBascula?: boolean;
}

export class ConfirmarBasculaDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmarBasculaLineaDto)
  lineas: ConfirmarBasculaLineaDto[];
  @IsOptional() @IsString() referencia?: string;
  @IsOptional() @IsString() motivo?: string;
  // D-SP5: cabecera opcional (back-compat) — persistida al confirmar báscula
  @IsOptional() @IsString() @MaxLength(80) remitoFisicoNumero?: string;
  @IsOptional() @IsString() @MaxLength(40) tipoComprobante?: string;
  @IsOptional() @IsString() @MaxLength(80) facturaNumero?: string;
}
export class ConfirmarBasculaLineaDto {
  @IsNumber() detalleId: number;
  @IsNumber() @Min(0) tnReales: number;
  @IsOptional() @IsNumber() @Min(0) precioPorTn?: number; // informativo/comercial
}

export class ListarVentasQueryDto {
  @IsOptional() @IsString() fechaDesde?: string;
  @IsOptional() @IsString() fechaHasta?: string;
  @IsOptional() @IsNumber() @Type(() => Number) clienteId?: number;
  @IsOptional() @IsString() cliente?: string;
  @IsOptional() @IsString() aserradero?: string;
  @IsOptional() @IsString() estadoFacturacion?: string;
  @IsOptional() @IsString() estadoDespacho?: string;
  @IsOptional() @IsString() origenTipo?: string;
}