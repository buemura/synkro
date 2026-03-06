import { type DynamicModule, Module } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";

import { SYNKRO_MODULE_OPTIONS } from "./synkro.constants.js";
import { SynkroExplorer } from "./synkro.explorer.js";
import { SynkroService } from "./synkro.service.js";
import type {
  SynkroModuleAsyncOptions,
  SynkroModuleOptions,
} from "./synkro.interfaces.js";

@Module({})
export class SynkroModule {
  static forRoot(options: SynkroModuleOptions): DynamicModule {
    return {
      module: SynkroModule,
      imports: [DiscoveryModule],
      providers: [
        {
          provide: SYNKRO_MODULE_OPTIONS,
          useValue: options,
        },
        SynkroExplorer,
        SynkroService,
      ],
      exports: [SynkroService],
      global: true,
    };
  }

  static forRootAsync(options: SynkroModuleAsyncOptions): DynamicModule {
    return {
      module: SynkroModule,
      imports: [...(options.imports ?? []), DiscoveryModule],
      providers: [
        {
          provide: SYNKRO_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        SynkroExplorer,
        SynkroService,
      ],
      exports: [SynkroService],
      global: true,
    };
  }
}
