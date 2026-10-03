import { Logger } from '@nestjs/common';

import { DiskUtil } from '@app/media-storage/utils/disk-util.type';
import {
  DeleteObjectCommand,
  GetBucketLifecycleConfigurationCommand,
  GetObjectCommand,
  HeadObjectCommand,
  LifecycleRule,
  PutBucketLifecycleConfigurationCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  TEMP_UPLOAD_EXPIRY_DAYS,
  TEMP_UPLOAD_LIFECYCLE_RULE_ID,
  TEMP_UPLOAD_PREFIX,
} from '@app/media-storage/constants';

export class S3DiskUtil implements DiskUtil {
  private readonly logger = new Logger(S3DiskUtil.name);
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

  /**
   * Installs the `tmp/` expiry rule, preserving any other lifecycle rules the
   * bucket already carries — PutBucketLifecycleConfiguration replaces the whole
   * configuration, so the existing set has to be read and merged first.
   *
   * Never throws: a bucket whose credentials lack s3:PutLifecycleConfiguration
   * must still serve uploads. The temp objects are deleted on success anyway;
   * the rule only catches originals orphaned by a job that died mid-flight.
   */
  public async ensureTempPrefixLifecycleRule(): Promise<boolean> {
    const rule: LifecycleRule = {
      ID: TEMP_UPLOAD_LIFECYCLE_RULE_ID,
      Status: 'Enabled',
      Filter: { Prefix: `${TEMP_UPLOAD_PREFIX}/` },
      Expiration: { Days: TEMP_UPLOAD_EXPIRY_DAYS },
      // Without this an interrupted multipart upload under tmp/ leaves parts
      // that the object-expiration rule above cannot reach.
      AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
    };

    try {
      const existing = await this.getLifecycleRules();
      const others = existing.filter(
        (candidate) => candidate.ID !== TEMP_UPLOAD_LIFECYCLE_RULE_ID,
      );

      await this.s3Client.send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: this.bucketName,
          LifecycleConfiguration: { Rules: [...others, rule] },
        }),
      );

      this.logger.log(
        `Lifecycle rule "${TEMP_UPLOAD_LIFECYCLE_RULE_ID}" active on ` +
          `${this.bucketName}: ${TEMP_UPLOAD_PREFIX}/ expires after ` +
          `${TEMP_UPLOAD_EXPIRY_DAYS} days`,
      );
      return true;
    } catch (error) {
      this.logger.warn(
        `Could not install the ${TEMP_UPLOAD_PREFIX}/ lifecycle rule on ` +
          `${this.bucketName}: ${(error as Error).message}. Orphaned temp ` +
          'originals will not expire automatically until it is applied.',
      );
      return false;
    }
  }

  private async getLifecycleRules(): Promise<LifecycleRule[]> {
    try {
      const current = await this.s3Client.send(
        new GetBucketLifecycleConfigurationCommand({ Bucket: this.bucketName }),
      );
      return current.Rules ?? [];
    } catch (error) {
      // A bucket with no configuration at all answers NoSuchLifecycleConfiguration;
      // that is the empty set, not a failure.
      if (
        (error as { name?: string })?.name === 'NoSuchLifecycleConfiguration'
      ) {
        return [];
      }
      throw error;
    }
  }

  /**
   * HeadObject rather than GetObject: the caller only needs to know whether a
   * retained original survived the tmp/ lifecycle rule, and downloading it to
   * find out would move a phone photo through this service for nothing.
   */
  public async exists(filePath: string): Promise<boolean> {
    try {
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: filePath,
        }),
      );

      return true;
    } catch (error) {
      const name = (error as { name?: string })?.name;
      const statusCode = (error as { $metadata?: { httpStatusCode?: number } })
        ?.$metadata?.httpStatusCode;

      if (name === 'NotFound' || name === 'NoSuchKey' || statusCode === 404) {
        return false;
      }

      // A permissions or network failure is not an answer. Reporting it as
      // "gone" would send the user off to re-pick a photo that is still there.
      throw error;
    }
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
