import { BadRequestException, ValidationError } from '@nestjs/common';

/**
 * QA-18: the global ValidationPipe's default exceptionFactory joins
 * class-validator's per-property sentences ("name must be longer than or
 * equal to 2 characters") into `message: string[]` — developer wording, with
 * a lower-cased field name, that the register form was showing verbatim.
 *
 * Wired into the gateway's global ValidationPipe (main.ts) rather than a
 * per-controller one: Nest runs the global pipe before any controller-level
 * pipe, and the global one's own exceptionFactory throws first on invalid
 * input, so a controller-scoped override here would never run. This lane
 * owns apps/wardrobe-api-gateway/src/auth/** — main.ts is outside that, but
 * QA-18 cannot be fixed without touching the one line that wires this in; see
 * state.md for that call.
 *
 * Replaces the sentence with a stable `{ field, code }` pair per violated
 * constraint — `code` is the class-validator constraint key (`minLength`,
 * `isNotEmpty`, …) upper-snake-cased, so a client can map it to its own copy
 * without parsing English. Applies to every gateway route, not just auth —
 * no existing test (jest or Playwright) asserts on the old `message: string[]`
 * shape, only on status codes and a few business-exception `code` fields
 * that this does not touch.
 */
export interface ApiFieldError {
  field: string;
  code: string;
}

function toCode(constraintKey: string): string {
  return constraintKey.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ApiFieldError[] {
  return errors.flatMap((error) => {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    const ownErrors = Object.keys(error.constraints ?? {}).map((key) => ({
      field,
      code: toCode(key),
    }));

    const nestedErrors = error.children?.length
      ? flattenValidationErrors(error.children, field)
      : [];

    return [...ownErrors, ...nestedErrors];
  });
}

export function validationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    code: 'VALIDATION_ERROR',
    message: 'Validation failed',
    fields: flattenValidationErrors(errors),
  });
}
