import { UserAccountPreview } from '../../users/types';

export type AuthUserAccount = UserAccountPreview & {
  accessToken: string;
};
