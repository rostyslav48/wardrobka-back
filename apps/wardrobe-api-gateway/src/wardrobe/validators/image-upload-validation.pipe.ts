import {
  FileTypeValidator,
  MaxFileSizeValidator,
  ParseFilePipe,
} from '@nestjs/common';

export const ImageUploadValidationPipe = new ParseFilePipe({
  fileIsRequired: false,
  validators: [
    new MaxFileSizeValidator({ maxSize: 3 * 1024 * 1024 }),
    new FileTypeValidator({
      fileType: /^image\/(jpeg|png|webp|heic)$/,
    }),
  ],
});
