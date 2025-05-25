import { DiskUtil } from '@app/media-storage/utils/disk-util.type';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export class S3DiskUtil implements DiskUtil {
  private readonly s3Client: S3Client;

  constructor(
    region: string,
    private readonly bucketName: string,
  ) {
    this.s3Client = new S3Client({ region: region });
  }

  public async upload(fileName: string, file: Buffer): Promise<string> {
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileName,
        Body: file,
      }),
    );

    return fileName;
  }

  public async getSignedUrl(
    filePath: string,
    expiresIn: number = 3600,
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: filePath,
    });

    return await getSignedUrl(this.s3Client, command, {
      expiresIn,
    });
  }

  public async delete(filePath: string): Promise<boolean> {
    await this.s3Client.send(
      new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: filePath,
      }),
    );

    return true;
  }
}
