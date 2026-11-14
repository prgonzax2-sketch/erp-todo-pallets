import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { IVA_ALICUOTAS, TIPOS_COMPROBANTE } from '../gastos.calculos.js';
import { GastoLineaItemDto } from './gasto-linea-item.dto.js';

export class UpdateGastoDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  aserraderoId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  areaId?: number;

  @IsOptional()
  @IsDateString()
  fecha?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @Transform(({ value }) => (value === null || value === '' ? null : value))
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  proveedorId?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  proveedorNombre?: string | null;

  @IsOptional()
  @IsString()
  @IsIn([...TIPOS_COMPROBANTE])
  tipoComprobante?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  puntoVenta?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  numeroComprobante?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  responsable?: string;

  @IsOptional()
  @Type(() => Number)
  @IsIn([...IVA_ALICUOTAS])
  ivaAlicuota?: number;

  @IsOptional()
  @IsBoolean()
  ivaExento?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  otrosTributos?: number;

  @IsOptional()
  @IsString()
  observaciones?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GastoLineaItemDto)
  lineas?: GastoLineaItemDto[];
}
