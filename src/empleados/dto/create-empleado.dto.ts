import { IsBoolean, IsEmail, IsIn, IsNumber, IsObject, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateEmpleadoDto {
  @IsString()
  nombreCompleto: string;

  @IsString()
  documento: string;

  @IsString()
  cuil: string;

  @IsOptional()
  @IsString()
  aserradero?: string;

  @IsOptional()
  @IsIn(['sin_acceso', 'admin_aserradero', 'admin_general'])
  rolUsuario?: 'sin_acceso' | 'admin_aserradero' | 'admin_general';

  @IsOptional()
  @ValidateIf((o) => o.email != null && o.email !== '')
  @IsEmail()
  email?: string;

  @IsOptional()
  @ValidateIf((o) => o.password != null && o.password !== '')
  @IsString()
  @MinLength(6)
  password?: string;

  @IsOptional()
  @IsString()
  telefonoPersonal?: string;

  @IsOptional()
  @IsString()
  telefonoEmergencia?: string;

  @IsOptional()
  @IsBoolean()
  estaEnBlanco?: boolean;

  @IsOptional()
  @IsBoolean()
  tieneSeguro?: boolean;

  @IsOptional()
  @IsString()
  imagenDniFrente?: string;

  @IsOptional()
  @IsString()
  imagenDniDorso?: string;

  @IsOptional()
  @IsString()
  puesto?: string;

  @IsOptional()
  @IsString()
  categoriaProduccion?: string;

  @IsOptional()
  @IsString()
  tipoSalario?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  sueldoFijo?: number;

  @IsOptional()
  @IsString()
  jornadaLaboral?: string;

  @IsOptional()
  @IsObject()
  diasPersonalizados?: Record<string, number> | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  precioPorHora?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  saldoPendiente?: number;

  @IsOptional()
  @IsBoolean()
  estaActivo?: boolean;

  @IsOptional()
  @IsString()
  fechaIngreso?: string;

  @IsOptional()
  @IsString()
  turnoIngreso?: string;

  @IsOptional()
  @IsString()
  fechaBaja?: string;

  @IsOptional()
  @IsString()
  turnoBaja?: string;
}