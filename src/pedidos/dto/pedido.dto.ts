import { IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePedidoItemDto {
  @IsOptional() @IsString() especie?: string;
  /** D-SP1: MADERA (default) | SUBPRODUCTO. */
  @IsOptional() @IsString() @IsIn(['MADERA', 'SUBPRODUCTO']) tipoProducto?: string;
  /** D-SP1: requerido si tipoProducto=SUBPRODUCTO. */
  @IsOptional() @IsString() @IsIn(['ASERRIN', 'CHIP']) subproductoTipo?: string;
  /** D-SP1: TN estimadas, requerido si tipoProducto=SUBPRODUCTO. */
  @IsOptional() @IsNumber() @Min(0.001) tnEstimada?: number;
  /** MADERA: requerido (validación explícita en service). SUBPRODUCTO: no aplica. */
  @IsOptional() @IsNumber() espesorSolicitado?: number;
  @IsOptional() @IsNumber() anchoSolicitado?: number;
  @IsOptional() @IsNumber() largoSolicitado?: number;
  @IsOptional() @IsString() unidadDimensiones?: string;
  /** MADERA: paquetes (>0). SUBPRODUCTO: opcional en DTO (service usa tnEstimada). */
  @IsOptional() @IsNumber() @Min(0.001) cantidadSolicitada?: number;
  @IsOptional() @IsString() observaciones?: string;
}

export class CreatePedidoDto {
  @IsOptional() @IsString() fecha?: string;
  @IsOptional() @IsInt() clienteId?: number;
  @IsString() clienteNombre: string;
  @IsOptional() @IsString() clienteCuitDni?: string;
  @IsOptional() @IsString() clienteTelefono?: string;
  @IsOptional() @IsString() clienteDireccion?: string;
  @IsOptional() @IsString() aserradero?: string;
  @IsOptional() @IsString() observaciones?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreatePedidoItemDto) items: CreatePedidoItemDto[];
}

export class CrearAsignacionDto {
  @IsInt() pedidoItemId: number;
  @IsInt() produccionId: number;
  @IsNumber() @Min(0.001) paquetes: number;
}

export class BuscarStockDisponibleDto {
  @IsOptional() @IsString() especie?: string;
  @IsNumber() @Type(() => Number) espesor: number;
  @IsNumber() @Type(() => Number) ancho: number;
  @IsNumber() @Type(() => Number) largo: number;
  @IsOptional() @IsString() incluirOtrosAserraderos?: string;
  @IsOptional() @IsString() aserradero?: string;
}

export class EmitirDespachoLineaDto {
  @IsInt() pedidoAsignacionId: number;
  @IsNumber() @Min(0) precioUnitario: number;
  @IsOptional() @IsNumber() @Min(0) alicuotaIva?: number;
  @IsOptional() @IsString() @IsIn(['P2', 'TN', 'M2', 'UNIDAD']) unidadPrecio?: string;
  @IsOptional() @IsNumber() @Min(0) m2?: number;
}

export class EmitirDespachoDto {
  @IsOptional() @IsString() fecha?: string;
  @IsOptional() @IsString() remitoFisicoNumero?: string;
  @IsOptional() @IsString() tipoComprobante?: string;
  @IsOptional() @IsString() facturaNumero?: string;
  @IsOptional() @IsString() transporte?: string;
  @IsOptional() @IsString() observaciones?: string;
  /** Si omite, despacha TODAS las asignaciones RESERVADA del pedido (remito completo de lo reservado). */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EmitirDespachoLineaDto) lineas?: EmitirDespachoLineaDto[];
  @IsOptional() @IsNumber() @Min(0) alicuotaIvaDefault?: number;
}

export class EmitirRemitoSubproductoItemDto {
  @IsInt() id: number;
  @IsOptional() @IsString() @IsIn(['ASERRIN', 'CHIP']) subproductoTipo?: string;
  @IsOptional() @IsNumber() @Min(0.001) tnEstimada?: number;
}

/** F2 D-SP2/D-SP3: remito provisional de subproducto (Chip/Aserrín, TN estimada), sin afectar stock de producción. */
export class EmitirRemitoSubproductoDto {
  /** Si se omite, emite todos los ítems SUBPRODUCTO pendientes del pedido. */
  @IsOptional() @IsArray() @IsInt({ each: true }) itemIds?: number[];
  /** Alternativa: ítems a emitir con override de tipo/TN (permite elegir Chip/Aserrín y TN estimada al emitir). */
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EmitirRemitoSubproductoItemDto) items?: EmitirRemitoSubproductoItemDto[];
  /** Precio por TN aplicado a todos los ítems emitidos (default 0). */
  @IsOptional() @IsNumber() @Min(0) precioPorTn?: number;
  @IsOptional() @IsNumber() @Min(0) alicuotaIva?: number;
  @IsOptional() @IsNumber() @Min(0) alicuotaIvaDefault?: number;
  @IsOptional() @IsString() fecha?: string;
  @IsOptional() @IsString() remitoFisicoNumero?: string;
  @IsOptional() @IsString() tipoComprobante?: string;
  @IsOptional() @IsString() facturaNumero?: string;
  @IsOptional() @IsString() transporte?: string;
  @IsOptional() @IsString() observaciones?: string;
}


