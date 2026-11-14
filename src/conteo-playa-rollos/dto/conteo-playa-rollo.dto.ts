import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ConteoPlayaRolloItemDto {
  @IsNumber() @Min(0)
  largoRollo: number;

  @IsNumber() @Min(0)
  metrosLineales: number;

  @IsNumber() @Min(0)
  alto: number;

  @IsOptional() @IsNumber() @Min(0)
  factorTn?: number;

  @IsOptional() @IsString()
  grupoEspecie?: string;
}

export class CreateConteoPlayaRolloDto {
  @IsOptional() @IsString()
  aserradero?: string; // admin general puede indicar; asignado se fuerza

  @IsString()
  fechaCierre: string; // YYYY-MM-DD

  @IsOptional() @IsString()
  turno?: string;

  @IsOptional() @IsIn(['semanal', 'mensual', 'libre'])
  tipoPeriodo?: 'semanal' | 'mensual' | 'libre';

  @IsOptional() @IsNumber() @Min(0)
  factorTnPlaya?: number;

  @IsOptional() @IsString()
  observaciones?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConteoPlayaRolloItemDto)
  items: ConteoPlayaRolloItemDto[];
}

export class ListConteoPlayaQueryDto {
  @IsOptional() @IsString()
  aserradero?: string;
  @IsOptional() @IsString()
  desde?: string;
  @IsOptional() @IsString()
  hasta?: string;
  @IsOptional() @IsString()
  page?: string;
  @IsOptional() @IsString()
  limit?: string;
}

export class ResumenPeriodoConteoQueryDto {
  @IsOptional() @IsString()
  aserradero?: string;
  @IsOptional() @IsIn(['semana', 'mes'])
  agrupacion?: 'semana' | 'mes';
  @IsOptional() @IsString()
  desde?: string;
  @IsOptional() @IsString()
  hasta?: string;
}
