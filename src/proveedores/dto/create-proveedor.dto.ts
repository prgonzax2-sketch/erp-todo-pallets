import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { IsCuit } from '../../common/validators/cuit.validator.js';

export class CreateProveedorDto {
  @IsString()
  @MaxLength(200)
  razonSocial: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombreFantasia?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  @IsCuit()
  cuit?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  rubroHabitualId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  telefono?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  direccion?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
