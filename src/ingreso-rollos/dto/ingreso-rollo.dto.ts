import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateIngresoRolloDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  maderaId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  proveedorMaderaId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  quintaId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  plantacionId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  cargaDDD?: string;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  transporteId: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  fleteroId: number;

  @IsString()
  @MaxLength(100)
  nroRemito: string;

  @IsDateString()
  fecha: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  aserradero?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  largoMetros?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  m3?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  toneladas: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precioTnMadera: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precioFleteTn: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ajustesAdicionalesFlete?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stockCampoM3?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stockCampoTN?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  utilizacionSemanalRollo?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  stockFinalCampo?: number | null;
}

export class UpdateIngresoRolloDto {
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() maderaId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() proveedorMaderaId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() quintaId?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() plantacionId?: number | null;
  @IsOptional() @IsString() @MaxLength(50) cargaDDD?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() transporteId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsPositive() fleteroId?: number;
  @IsOptional() @IsString() @MaxLength(100) nroRemito?: string;
  @IsOptional() @IsDateString() fecha?: string;
  @IsOptional() @IsString() @MaxLength(120) aserradero?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) largoMetros?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) m3?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) toneladas?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) precioTnMadera?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) precioFleteTn?: number;
  @IsOptional() @Type(() => Number) @IsNumber() ajustesAdicionalesFlete?: number;
  @IsOptional() @Type(() => Number) @IsNumber() stockCampoM3?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() stockCampoTN?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() utilizacionSemanalRollo?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber() stockFinalCampo?: number | null;
}

export class ListIngresoRollosDto {
  @IsOptional() @IsDateString() fechaDesde?: string;
  @IsOptional() @IsDateString() fechaHasta?: string;
  @IsOptional() @Type(() => Number) @IsInt() maderaId?: number;
  @IsOptional() @Type(() => Number) @IsInt() proveedorMaderaId?: number;
  @IsOptional() @Type(() => Number) @IsInt() transporteId?: number;
  @IsOptional() @Type(() => Number) @IsInt() fleteroId?: number;
  @IsOptional() @IsString() aserradero?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}
