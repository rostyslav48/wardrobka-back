import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { UserAccountEntity } from '@app/common/database/entities/auth';

import { CreateUserAccountRequest } from '../dto';

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
}
