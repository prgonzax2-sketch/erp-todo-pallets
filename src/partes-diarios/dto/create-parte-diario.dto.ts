import { IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateParteDiarioDto {
  @IsNumber()
  empleadoId: number;

  @IsString()
  fecha: string;

  @IsOptional()
  @IsNumber()
  horasTrabajadas?: number;

  @IsOptional()
  @IsNumber()
  precioPorHora?: number;

  @IsOptional()
  @IsNumber()
  palletsFabricados?: number;

  @IsOptional()
  @IsNumber()
  precioPorPallet?: number;

  @IsOptional()
  @IsNumber()
  turnosLimpieza?: number;

  @IsOptional()
  @IsNumber()
  precioPorLimpieza?: number;

  @IsOptional()
  @IsNumber()
  camionesCargados?: number;

  @IsOptional()
  @IsNumber()
  precioPorCamion?: number;

  @IsOptional()
  @IsNumber()
  montoExtra?: number;

  @IsOptional()
  @IsString()
  detalleExtra?: string;
}