import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { UserAccountEntity } from '@app/common/database/entities/auth';

import {
  CreateUserAccountRequest,
  ProfileResponse,
  UpdateProfileRequest,
} from '../dto';
import { normaliseEmail } from '../utils/normalise-input';

@Injectable()
export class UsersService {
  constructor(
    private readonly entityManager: EntityManager,
    @InjectRepository(UserAccountEntity)
    private userAccountItemRepository: Repository<UserAccountEntity>,
  ) {}

  // Normalised again here (not just in the DTOs) so every write/lookup against
  // the email column stays case/whitespace-insensitive regardless of which
  // transport delivered the value — see QA-15/QA-16.
  public findUserByEmail(email: string): Promise<UserAccountEntity> {
    return this.userAccountItemRepository.findOneByOrFail({
      email: normaliseEmail(email) as string,
    });
  }

  public async createUser(
    dto: CreateUserAccountRequest,
  ): Promise<UserAccountEntity> {
    const item = this.userAccountItemRepository.create({
      ...dto,
      name: dto.name.trim(),
      email: normaliseEmail(dto.email) as string,
    });
    return this.entityManager.save(item);
  }

  public async checkEmail(email: string): Promise<boolean> {
    const count = await this.userAccountItemRepository.count({
      where: { email: normaliseEmail(email) as string },
    });
    return count > 0;
  }

  public async getProfile(accountId: number): Promise<ProfileResponse> {
    const user = await this.userAccountItemRepository.findOneOrFail({
      where: { id: accountId },
      select: ['id', 'name', 'email', 'city'],
    });

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      city: user.city ?? null,
    };
  }

  public async updateProfile(
    accountId: number,
    dto: UpdateProfileRequest,
  ): Promise<ProfileResponse> {
    const user = await this.userAccountItemRepository.findOneByOrFail({
      id: accountId,
    });

    if (dto.name !== undefined) {
      user.name = dto.name.trim();
    }
    if (dto.city !== undefined) {
      user.city = dto.city?.trim() ?? null;
    }

    await this.userAccountItemRepository.save(user);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      city: user.city ?? null,
    };
  }

  public async upsertPushToken(
    accountId: number,
    expoPushToken?: string | null,
  ): Promise<void> {
    await this.userAccountItemRepository.update(
      { id: accountId },
      { expoPushToken: expoPushToken ?? null },
    );
  }
}
