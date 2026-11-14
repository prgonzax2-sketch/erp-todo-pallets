import { SetMetadata } from '@nestjs/common';
import { REQUIRED_ROLES_KEY } from '../guards/roles.guard.js';

export const Roles = (...roles: string[]) => SetMetadata(REQUIRED_ROLES_KEY, roles);