import { createParamDecorator, ExecutionContext } from '@nestjs/common';

import { UserAccountPreview } from '@app/auth/users/types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserAccountPreview | null => {
    const request = ctx.switchToHttp().getRequest();
    return request.user ?? null;
  },
);
