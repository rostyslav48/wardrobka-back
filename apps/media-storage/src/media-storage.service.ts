import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';

import { DiskUtil } from '@app/media-storage/utils/disk-util.type';
import { S3DiskUtil } from '@app/media-storage/utils';

import { FileTransfer } from '@app/media-storage/models/file-transfer';
import { EnvironmentType } from '@app/common/enums';

@Injectable()
export class MediaStorageService {
  private readonly Disk: DiskUtil;

  constructor(configService: ConfigService) {
    const environment: EnvironmentType =
      configService.getOrThrow('NODE_ENVIRONMENT');

    switch (environment) {
      case EnvironmentType.Prod:
        {
          this.Disk = new S3DiskUtil(
            configService.getOrThrow('AWS_S3_REGION'),
            configService.getOrThrow('AWS_S3_BUCKET_NAME'),
          );
        }
        break;

      case EnvironmentType.Dev:
        {
          this.Disk = new S3DiskUtil(
            configService.getOrThrow('AWS_S3_REGION'),
            configService.getOrThrow('AWS_S3_BUCKET_NAME'),
          );
        }
        break;

      default: {
        this.Disk = null;
      }
    }
  }

  public upload(file: FileTransfer, path: string): Promise<string> {
    const filename = this.generateUniqueFilename(file.originalname);
    const pathWithFilename = path + '/' + filename;

    return this.Disk.upload(
      pathWithFilename,
      Buffer.from(file.fileBase64, 'base64'),
    );
  }

  private generateUniqueFilename(originalFilename: string): string {
    const uniqueName = uuidv4();
    const extension = extname(originalFilename);

    return `${uniqueName}${extension}`;
  }

  public getSignedUrl(filePath: string): Promise<string> {
    return this.Disk.getSignedUrl(filePath);
  }

  public delete(filePath: string): Promise<boolean> {
    return this.Disk.delete(filePath);
  }
}
