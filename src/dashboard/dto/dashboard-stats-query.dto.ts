import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

export const DASHBOARD_PERIODOS = ['day', 'week', 'month'] as const;
export type DashboardPeriodoDto = (typeof DASHBOARD_PERIODOS)[number];

export class DashboardStatsQueryDto {
  @IsOptional()
  @IsIn(DASHBOARD_PERIODOS)
  periodo?: DashboardPeriodoDto;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fecha debe tener formato YYYY-MM-DD' })
  fecha?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  aserradero?: string;
}
