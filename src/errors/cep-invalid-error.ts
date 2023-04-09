import { ApplicationError } from '@/protocols';

export function cepInvalidError(): ApplicationError {
  return {
    name: 'InvalidCepError',
    message: 'Your CEP is invalid!',
  };
}
