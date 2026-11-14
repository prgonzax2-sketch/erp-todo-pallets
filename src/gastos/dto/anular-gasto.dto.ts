import { IsString, MaxLength, MinLength } from 'class-validator';

export class AnularGastoDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  motivo: string;
}
