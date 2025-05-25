export interface DiskUtil {
  upload(fileName: string, file: Buffer): Promise<string>;

  getSignedUrl(filePath: string, expiresIn?: number): Promise<string>;

  delete(filePath: string): Promise<boolean>;
}
