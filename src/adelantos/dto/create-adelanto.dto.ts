import { IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateAdelantoDto {
  @Type(() => Number)
  @IsNumber()
  empleadoId: number; // Fundamental para saber de quién es

  @Type(() => Number)
  @IsNumber()
  monto: number;

  @Type(() => Number)
  @IsNumber()
  montoEntregado: number;

  @IsOptional()
  @IsString()
  metodoPago?: string;

  @IsOptional()
  @IsString()
  observaciones?: string;
}
