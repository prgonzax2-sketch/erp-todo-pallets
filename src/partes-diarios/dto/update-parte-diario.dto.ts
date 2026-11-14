import { PartialType } from '@nestjs/mapped-types';
import { CreateParteDiarioDto } from './create-parte-diario.dto.js';

export class UpdateParteDiarioDto extends PartialType(CreateParteDiarioDto) {}
