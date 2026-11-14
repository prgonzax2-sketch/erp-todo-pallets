import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateMaderaDto {
  @IsString()
  @MaxLength(150)
  nombre: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class UpdateMaderaDto {
  @IsOptional()
  @IsString()
  @MaxLength(150)
  nombre?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
