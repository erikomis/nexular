import { getModuleMetadata } from "./module/module";
import { container, getInjectableScope } from "./di/container";
import { I18nService } from "./mcp/i18n";
import { MCPService } from "./mcp/service";
import { AuthService, createAuthServiceWithDefaults } from "./auth/strategies";
import { applyAuthPlugins } from "../../server/auth-plugin-loader";

export function bootstrap(AppModule: any): void {
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

  moduleMetadata?.providers?.forEach((ProviderClass) => {
    if (!container.has(ProviderClass)) {
      container.registerClass(ProviderClass, {
        useClass: ProviderClass,
        scope: getInjectableScope(ProviderClass),
      });
    }
  });

  console.log("Nexular app iniciado com sucesso.");
}
