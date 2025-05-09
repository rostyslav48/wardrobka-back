import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';

import { UserAccountEntity } from '@app/common/database/entities/auth';

@Injectable()
export class UsersService {
  constructor(
    private readonly entityManager: EntityManager,
    @InjectRepository(UserAccountEntity)
    private userAccountItemRepository: Repository<UserAccountEntity>,
  ) {}

  findUserByEmail(email: string): Promise<UserAccountEntity> {
    return this.userAccountItemRepository.findOneByOrFail({ email });
  }
}
