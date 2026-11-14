import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTransporteDto {
  @IsString()
  @MaxLength(200)
  nombre: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpdateTransporteDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombre?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
