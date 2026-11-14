import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class GastoLineaItemDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  rubroId: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  descripcion?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  cantidad: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  precioUnitario: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  orden?: number;
}
