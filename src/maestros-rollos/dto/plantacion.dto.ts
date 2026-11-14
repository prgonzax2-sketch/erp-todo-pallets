import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePlantacionDto {
  @IsString()
  @MaxLength(200)
  nombre: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  quintaId?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpdatePlantacionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombre?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  quintaId?: number | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
