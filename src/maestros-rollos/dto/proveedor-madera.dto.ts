import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateProveedorMaderaDto {
  @IsString()
  @MaxLength(200)
  nombre: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  cuit?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpdateProveedorMaderaDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombre?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  cuit?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
