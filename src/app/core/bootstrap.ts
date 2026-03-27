import { getModuleMetadata } from "./module/module";
import { container, getInjectableScope } from "./di/container";
import { I18nService } from "./mcp/i18n";
import { MCPService } from "./mcp/service";
import { AuthService, createAuthServiceWithDefaults } from "./auth/strategies";
import { applyAuthPlugins } from "../../server/auth-plugin-loader";
import type { ProviderClass } from "./di/container";

type ModuleConstructor = abstract new (...args: unknown[]) => object;

export function bootstrap(AppModule: ModuleConstructor): void {
  const moduleMetadata = getModuleMetadata(AppModule);

  if (!container.has(I18nService)) {
    container.registerClass(I18nService, {
      useClass: I18nService,
      scope: "singleton",
    });
  }

  if (!container.has(MCPService)) {
    container.registerClass(MCPService, {
      useClass: MCPService,
      scope: "singleton",
    });
  }

  if (!container.has(AuthService)) {
    container.register(AuthService, createAuthServiceWithDefaults());
  }

  applyAuthPlugins(container.resolve<AuthService>(AuthService));

  moduleMetadata?.providers?.forEach((providerClass) => {
    const classProvider = providerClass as ProviderClass;

    if (!container.has(classProvider)) {
      container.registerClass(classProvider, {
        useClass: classProvider,
        scope: getInjectableScope(classProvider),
      });
    }
  });

  process.stdout.write("Nexular app iniciado com sucesso.\n");
}
