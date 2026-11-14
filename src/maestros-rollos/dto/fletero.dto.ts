import { IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateFleteroDto {
  @IsString()
  @MaxLength(200)
  nombre: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  transporteId?: number;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpdateFleteroDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombre?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  transporteId?: number | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
