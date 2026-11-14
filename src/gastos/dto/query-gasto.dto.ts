import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ESTADOS_GASTO } from '../gastos.calculos.js';

export class QueryGastoDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  mes?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  anio?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  aserraderoId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  areaId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  rubroId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  proveedorId?: number;

  @IsOptional()
  @IsIn([...ESTADOS_GASTO])
  estado?: string;

  @IsOptional()
  @IsDateString()
  fechaDesde?: string;

  @IsOptional()
  @IsDateString()
  fechaHasta?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}
