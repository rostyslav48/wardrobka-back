import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { UserAccountEntity } from '../auth';

export type GoogleCalendarCredentialStatus = 'active' | 'revoked';

/**
 * One row per connected account. The primary key *is* the account id — a user
 * has at most one Google grant — and the FK carries ON DELETE CASCADE so
 * deleting the account takes the credential with it.
 *
 * Token values are AES-256-GCM ciphertext produced by `encryptProtectedData`
 * under PROTECTED_DATA_SECRET; `accessTokenExpiresAt` is deliberately a plain
 * column so expiry can be compared in SQL without decrypting.
 */
@Entity({ name: 'google_calendar_credential' })
export class GoogleCalendarCredentialEntity {
  @PrimaryColumn({ name: 'account_id', type: 'integer' })
  accountId: number;

  // Declared so the FK the migration creates is visible to TypeORM's schema
  // diff; without it schema:log reports the constraint as drift to be dropped.
  @ManyToOne(() => UserAccountEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account?: UserAccountEntity;

  @Column({ type: 'text', name: 'refresh_token_encrypted', nullable: true })
  refreshTokenEncrypted?: string | null;

  @Column({ type: 'text', name: 'access_token_encrypted', nullable: true })
  accessTokenEncrypted?: string | null;

  @Column({
    type: 'timestamp with time zone',
    name: 'access_token_expires_at',
    nullable: true,
  })
  accessTokenExpiresAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  scope?: string | null;

  @Column({ length: 20, default: 'active' })
  status: GoogleCalendarCredentialStatus;

  @Column({ type: 'text', nullable: true, name: 'last_error' })
  lastError?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
