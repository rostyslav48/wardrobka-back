import {
  FileTypeValidator,
  MaxFileSizeValidator,
  ParseFilePipe,
} from '@nestjs/common';

/**
 * The hard ceiling, enforced regardless of what the client does. The mobile
 * app downscales a photo before it ever reaches this pipe (see
 * `expo-image-manipulator` in the item form), so a normal upload sits well
 * under this — it exists to reject whatever slips past client-side
 * downscaling (a client that skips it, or a direct API call), not to be the
 * everyday limit.
 */
export const IMAGE_UPLOAD_HARD_CAP_BYTES = 8 * 1024 * 1024;

export const ImageUploadValidationPipe = new ParseFilePipe({
  fileIsRequired: false,
  validators: [
    new MaxFileSizeValidator({
      maxSize: IMAGE_UPLOAD_HARD_CAP_BYTES,
      message:
        'That photo is too large — please use a smaller image (under 8MB).',
    }),
    new FileTypeValidator({
      fileType: /^image\/(jpeg|png|webp|heic)$/,
    }),
  ],
});
