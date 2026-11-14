import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export const TIPOS_DEBITO_CC = [
  'debito_pago',
  'debito_adelanto',
  'debito_combustible',
  'debito_transferencia',
  'ajuste',
] as const;

export type TipoDebitoCc = (typeof TIPOS_DEBITO_CC)[number];

export class CreateMovimientoDebitoCcDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  fleteroId: number;

  @IsIn(TIPOS_DEBITO_CC)
  tipo: TipoDebitoCc;

  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  monto: number;

  @IsDateString()
  fecha: string;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  concepto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  medio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referencia?: string;

  @IsOptional()
  @IsString()
  observacion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  aserradero?: string;
}

export class ListMovimientosCcDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  fleteroId?: number;

  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;
}
