import { IsString, IsNumber, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ProduccionEntradaDto {
  @IsString()
  fecha: string;

  @IsString()
  turno: string;

  @IsString()
  tipoProducto: string;

  @IsString()
  especie: string;

  @IsString()
  descripcionProducto: string;

  @IsOptional()
  @IsString()
  aserradero?: string;

  @IsOptional()
  @IsString()
  lote?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;

  @IsString()
  unidadMedida: string;

  @IsString()
  unidadDimensiones: string;

  @IsString()
  unidadResultado: string;

  @IsNumber()
  cantidadPaquetes: number;

  @IsNumber()
  piezasPorPaquete: number;

  @IsNumber()
  espesor: number;

  @IsNumber()
  ancho: number;

  @IsNumber()
  largo: number;

  @IsOptional()
  @IsArray()
  separadores?: any[];

  @IsOptional()
  @IsArray()
  tacos?: any[];

  @IsOptional()
  @IsArray()
  tags?: any[];
}

export class CreateProduccionEntradaDto extends ProduccionEntradaDto {}

export class CreateProduccionMasivaDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProduccionEntradaDto)
  entradas: ProduccionEntradaDto[];
}
