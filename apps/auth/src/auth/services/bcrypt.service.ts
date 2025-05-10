import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class BcryptService {
  public encodePassword(password: string): Promise<string> {
    const salt = bcrypt.genSaltSync();
    return bcrypt.hash(password, salt);
  }

  public comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}
