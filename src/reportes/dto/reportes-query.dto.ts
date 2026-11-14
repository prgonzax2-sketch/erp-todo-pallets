import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

export class ReportesQueryDto {
  @IsOptional()
  @IsIn(['day', 'week', 'month', 'year'])
  periodo?: 'day' | 'week' | 'month' | 'year';

  @IsOptional()
  @IsDateString()
  fecha?: string; // referencia

  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  @IsOptional()
  @IsString()
  aserradero?: string;

  @IsOptional()
  @IsIn(['json', 'csv'])
  format?: 'json' | 'csv';

  /** ventas: incluir anulados (default false). gastos: filtrar por estado (default CONFIRMADO). */
  @IsOptional()
  @IsString()
  estado?: string;

  @IsOptional()
  @IsString()
  incluirAnulados?: string; // 'true' para ventas
}
