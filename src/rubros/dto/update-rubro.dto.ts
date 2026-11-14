import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateRubroDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nombre?: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
