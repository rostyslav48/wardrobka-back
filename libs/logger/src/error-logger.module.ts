import { DynamicModule, Module } from '@nestjs/common';

import { RmqModule } from '@app/common';
import { LOGGER_SERVICE } from '@app/wardrobe-api-gateway/constants';

import { ERROR_LOGGER_MODULE_OPTIONS } from './constants';
import { ErrorLoggerService } from './error-logger.service';
import { ErrorLoggerModuleOptions } from './types';

@Module({})
export class ErrorLoggerModule {
  static register(options: ErrorLoggerModuleOptions = {}): DynamicModule {
    return {
      module: ErrorLoggerModule,
      imports: [RmqModule.register({ name: LOGGER_SERVICE })],
      providers: [
        { provide: ERROR_LOGGER_MODULE_OPTIONS, useValue: options },
        ErrorLoggerService,
      ],
      exports: [ErrorLoggerService],
    };
  }
}
