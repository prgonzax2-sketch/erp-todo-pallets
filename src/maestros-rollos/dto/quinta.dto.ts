import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateQuintaDto {
  @IsString()
  @MaxLength(200)
  nombre: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  proveedorMaderaId?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpdateQuintaDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombre?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  proveedorMaderaId?: number | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
