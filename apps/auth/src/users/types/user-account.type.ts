export interface UserAccount {
  id: number;
  name: string;
  email: string;
  password: string;
}

export type UserAccountPreview = Omit<UserAccount, 'password'>;
