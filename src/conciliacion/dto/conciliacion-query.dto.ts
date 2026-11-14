import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

export class ConciliacionResumenQueryDto {
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @IsString() aserradero?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true' || value === '1') global?: boolean;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'desde debe ser YYYY-MM-DD' }) desde?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'hasta debe ser YYYY-MM-DD' }) hasta?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha debe ser YYYY-MM-DD' }) fecha?: string;
  @IsOptional() @IsIn(['day', 'week', 'month']) periodo?: 'day' | 'week' | 'month';
}

export class RemanenteRollosQueryDto {
  @IsOptional() @IsString() aserradero?: string;
  @IsOptional() @IsString() fecha?: string; // YYYY-MM-DD, default hoy (v1)
}

export class SubproductosStockQueryDto {
  @IsOptional() @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @IsString() aserradero?: string;
  @IsOptional() @IsString() fecha?: string; // YYYY-MM-DD, default hoy (v1)
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'desde debe ser YYYY-MM-DD' }) desde?: string; // opcional; default alineado a post-cierre/conciliación
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'hasta debe ser YYYY-MM-DD' }) hasta?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true' || value === '1') global?: boolean;
}
