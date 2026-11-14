import { IsIn, IsNumber, IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class CreateSubproductoEgresoDto {
  @IsOptional() @IsString()
  aserradero?: string;

  @IsIn(['ASERRIN', 'CHIP'])
  tipo: 'ASERRIN' | 'CHIP';

  @IsString()
  fecha: string; // YYYY-MM-DD

  @IsOptional() @IsIn(['PINO', 'EUCALIPTO', 'MEZCLA', 'OTRO'])
  especieDeclarada?: 'PINO' | 'EUCALIPTO' | 'MEZCLA' | 'OTRO';

  @IsNumber({}, { message: 'Ingresá las TN estimadas al momento de cargar (decisión obligatoria).' })
  @IsPositive({ message: 'Las TN estimadas deben ser mayores a 0 (decisión obligatoria al cargar).' })
  tnEstimadas: number;

  @IsOptional() @IsNumber() @Min(0)
  precioPorTn?: number | null;

  @IsOptional() @IsString()
  referencia?: string;

  @IsOptional() @IsString()
  observaciones?: string;
}

export class ConfirmarSubproductoEgresoDto {
  @IsNumber() @Min(0)
  tnReales: number;

  @IsOptional() @IsNumber() @Min(0)
  precioPorTn?: number | null;
}

export class ListSubproductoEgresoQueryDto {
  @IsOptional() @IsString() aserradero?: string;
  @IsOptional() @IsString() desde?: string;
  @IsOptional() @IsString() hasta?: string;
  @IsOptional() @IsString() tipo?: string;
}
