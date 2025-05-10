import { UserAccountPreview } from '@app/auth/users/types';

// T - type of data we passed
export type RequestType<T> = { user: UserAccountPreview | null; data: T };
