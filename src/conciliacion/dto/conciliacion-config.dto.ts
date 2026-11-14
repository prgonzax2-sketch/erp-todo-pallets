import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class ConciliacionCoefItemDto {
  @IsIn(['PINO', 'EUCALIPTO', 'MEZCLA', 'OTRO'])
  grupoEspecie: 'PINO' | 'EUCALIPTO' | 'MEZCLA' | 'OTRO';

  @IsOptional() @IsNumber() @Min(0.0001) @Max(1)
  rendimientoMadera?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(5)
  coefAserrin?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(5)
  coefChip?: number;
  @IsOptional() @IsNumber() @Min(0.0001) @Max(5)
  factorTnConsumo?: number;
  @IsOptional() @IsNumber() @Min(0.000001) @Max(1)
  m3UtilPorP2?: number;
  @IsOptional() @IsNumber() @Min(0.0001) @Max(5)
  factorTnPlayaDefault?: number;
  @IsOptional() @IsNumber() @Min(0.000001) @Max(20)
  factorTnAserrin?: number | null; // m³ aserrín -> TN (opcional)
  @IsOptional() @IsNumber() @Min(0.000001) @Max(20)
  factorTnChip?: number | null; // m³ chip -> TN (opcional)
}

export class UpsertConciliacionConfigDto {
  @IsOptional() @IsString()
  aserradero?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConciliacionCoefItemDto)
  items: ConciliacionCoefItemDto[];
}
