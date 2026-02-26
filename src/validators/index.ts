import { registerDecorator, type ValidationOptions, type ValidationArguments } from 'class-validator';

export function IsJsonOrArray(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isJsonOrArray',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'object' || value === null) return false;
          if (Array.isArray(value)) {
            return value.every((item) => typeof item === 'object' && item !== null && !Array.isArray(item));
          }
          return true;
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be either a JSON object or an array of JSON objects`;
        },
      },
    });
  };
}
