import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { UserAccountEntity } from '@app/common/database/entities/auth';

import {
  CreateUserAccountRequest,
  ProfileResponse,
  UpdateProfileRequest,
} from '../dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly entityManager: EntityManager,
    @InjectRepository(UserAccountEntity)
    private userAccountItemRepository: Repository<UserAccountEntity>,
  ) {}

  public findUserByEmail(email: string): Promise<UserAccountEntity> {
    return this.userAccountItemRepository.findOneByOrFail({ email });
  }

  public async createUser(
    dto: CreateUserAccountRequest,
  ): Promise<UserAccountEntity> {
    const item = this.userAccountItemRepository.create(dto);
    return this.entityManager.save(item);
  }

  public async checkEmail(email: string): Promise<boolean> {
    const count = await this.userAccountItemRepository.count({
      where: { email },
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
      user.name = dto.name;
    }
    if (dto.city !== undefined) {
      user.city = dto.city ?? null;
    }

    await this.userAccountItemRepository.save(user);

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      city: user.city ?? null,
    };
  }
}
