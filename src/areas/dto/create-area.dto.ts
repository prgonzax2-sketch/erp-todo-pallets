import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateAreaDto {
  @IsInt()
  @Min(1)
  aserraderoId: number;

  @IsString()
  @MaxLength(120)
  nombre: string;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}
