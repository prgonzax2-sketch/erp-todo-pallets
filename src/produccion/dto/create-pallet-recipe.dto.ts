import { IsString, IsNumber, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ComponenteMaderaDto {
  @IsString()
  especie: string;

  @IsNumber()
  cantidad: number;
}

export class CreatePalletRecipeDto {
  @IsString()
  nombre: string;

  @IsString()
  especieMadera: string;

  @IsNumber()
  piezasMaderaPorPallet: number;

  @IsNumber()
  costoUnitarioMadera: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComponenteMaderaDto)
  componentesMadera: ComponenteMaderaDto[];

  @IsString()
  tipoClavo: string;

  @IsNumber()
  costoUnitarioClavo: number;

  @IsNumber()
  cantidadClavosPorPallet: number;

  @IsNumber()
  tarifaManoObra: number;
}