import { PartialType } from '@nestjs/mapped-types';
import { CreateEmpleadoDto } from './create-empleado.dto.js';

export class UpdateEmpleadoDto extends PartialType(CreateEmpleadoDto) {}