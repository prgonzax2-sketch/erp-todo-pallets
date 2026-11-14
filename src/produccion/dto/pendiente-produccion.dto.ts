import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreatePendienteProduccionDto {
  @IsString()
  clienteNombre: string;

  @IsOptional()
  @IsNumber()
  clienteId?: number;

  @IsOptional()
  @IsString()
  fecha?: string;

  @IsString()
  aserradero: string;

  @IsString()
  especie: string;

  @IsNumber()
  espesor: number;

  @IsNumber()
  ancho: number;

  @IsNumber()
  largo: number;

  @IsOptional()
  @IsString()
  unidadDimensiones?: string;

  @IsNumber()
  cantidadRequerida: number;

  @IsOptional()
  @IsNumber()
  cantidadReferida?: number;

  @IsOptional()
  @IsNumber()
  p2Estimado?: number;

  @IsOptional()
  @IsString()
  observaciones?: string;
}

export class UpdatePendienteProduccionDto {
  @IsOptional()
  @IsString()
  estado?: string;

  @IsOptional()
  @IsNumber()
  cantidadProducida?: number;

  @IsOptional()
  @IsString()
  aserradero?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;
}

