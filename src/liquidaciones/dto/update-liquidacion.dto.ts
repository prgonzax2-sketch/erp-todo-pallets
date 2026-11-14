import { PartialType } from '@nestjs/mapped-types';
import { CreateLiquidacionDto } from './create-liquidacion.dto.js';

export class UpdateLiquidacionDto extends PartialType(CreateLiquidacionDto) {}