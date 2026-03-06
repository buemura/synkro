import { type DynamicModule, Module } from "@nestjs/common";
import { DiscoveryModule } from "@nestjs/core";

import { ORKO_MODULE_OPTIONS } from "./orko.constants.js";
import { OrkoExplorer } from "./orko.explorer.js";
import { OrkoService } from "./orko.service.js";
import type {
  OrkoModuleAsyncOptions,
  OrkoModuleOptions,
} from "./orko.interfaces.js";

@Module({})
export class OrkoModule {
  static forRoot(options: OrkoModuleOptions): DynamicModule {
    return {
      module: OrkoModule,
      imports: [DiscoveryModule],
      providers: [
        {
          provide: ORKO_MODULE_OPTIONS,
          useValue: options,
        },
        OrkoExplorer,
        OrkoService,
      ],
      exports: [OrkoService],
      global: true,
    };
  }

  static forRootAsync(options: OrkoModuleAsyncOptions): DynamicModule {
    return {
      module: OrkoModule,
      imports: [...(options.imports ?? []), DiscoveryModule],
      providers: [
        {
          provide: ORKO_MODULE_OPTIONS,
          useFactory: options.useFactory,
          inject: options.inject ?? [],
        },
        OrkoExplorer,
        OrkoService,
      ],
      exports: [OrkoService],
      global: true,
    };
  }
}
