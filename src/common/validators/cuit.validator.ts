import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';
import { isValidCuit } from './cuit.js';

export function IsCuit(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCuit',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null || value === '') return true;
          return typeof value === 'string' && isValidCuit(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} debe ser un CUIT válido (XX-XXXXXXXX-X) o estar vacío`;
        },
      },
    });
  };
}
