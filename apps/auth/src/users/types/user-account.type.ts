export interface UserAccount {
  id: number;
  name: string;
  email: string;
  password: string;
  city?: string | null;
}

export type UserAccountPreview = Omit<UserAccount, 'password'>;
