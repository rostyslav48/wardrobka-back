export interface DiskUtil {
  upload(fileName: string, file: Buffer): Promise<string>;

  getSignedUrl(filePath: string, expiresIn?: number): Promise<string>;

  delete(filePath: string): Promise<boolean>;

  /**
   * Installs the retention policy for the `tmp/` prefix, if the backing disk
   * has one. Optional: only object stores with lifecycle support implement it.
   */
  ensureTempPrefixLifecycleRule?(): Promise<boolean>;
}
