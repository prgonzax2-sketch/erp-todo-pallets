import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, ArrayMinSize } from 'class-validator';

export class CreateMesaPalletDto {
  @IsString()
  @MaxLength(120)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  aserradero?: string;

  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  integranteIds: number[];

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpdateMesaPalletDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  aserradero?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @Type(() => Number)
  @IsInt({ each: true })
  integranteIds?: number[];

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class RegistrarPalletProduccionDto {
  @Type(() => Number)
  @IsInt()
  palletId: number;

  @Type(() => Number)
  @IsInt()
  cantidad: number;

  @IsOptional()
  @Type(() => Number)
  tarifaManoObra?: number;

  @IsOptional()
  @IsString()
  aserradero?: string;

  /** Si se indica, se usa la mesa y se reparte cantidad entre sus integrantes activos/definidos. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  mesaId?: number;

  /** Alternativa explícita a mesaId: IDs de operarios para reparto automático. */
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  operarioIds?: number[];
}
