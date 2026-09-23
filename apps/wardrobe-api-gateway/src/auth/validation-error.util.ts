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
 *
 * `message` stays populated (as `"<field>:<code>"` per violation, still an
 * array like the pre-QA-18 shape) rather than a fixed string. The frontend's
 * LoginScreen (register + login, `wardrobe-assistant-front/components/pages/
 * login/LoginScreen/index.tsx`) reads `e.response.message` on a 400 and
 * renders it verbatim in the error banner — that lane (redesign-core) has not
 * migrated it to read `fields[]` yet. A fixed `'Validation failed'` string
 * would have made every validation error in that banner identical and lost
 * all field information; this keeps it field-specific without reintroducing
 * the raw class-validator sentence QA-18 was filed against. See state.md for
 * the handoff this still needs at the merge gate.
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
  const fields = flattenValidationErrors(errors);

  return new BadRequestException({
    statusCode: 400,
    error: 'Bad Request',
    code: 'VALIDATION_ERROR',
    message: fields.map((f) => `${f.field}:${f.code}`),
    fields,
  });
}
