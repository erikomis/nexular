export type ProviderScope = "singleton" | "transient";

export type ProviderClass<T = any> = new (...args: any[]) => T;
type InjectableClass<T = any> = ProviderClass<T> & { inject?: any[] };

export type ClassProvider<T = any> = {
  useClass: InjectableClass<T>;
  scope?: ProviderScope;
  deps?: any[];
};

type ProviderRecord = {
  factory: () => any;
  scope: ProviderScope;
  instance?: any;
};

export class Container {
  private readonly providers = new Map<any, ProviderRecord>();

  constructor(private readonly parent?: Container) {}

  register<T>(token: any, instance: T): void {
    this.providers.set(token, {
      scope: "singleton",
      instance,
      factory: () => instance,
    });
  }

  registerClass<T>(token: any, provider: ClassProvider<T>): void {
    const scope = provider.scope ?? "singleton";
    const deps = provider.deps ?? provider.useClass.inject ?? [];

    this.providers.set(token, {
      scope,
      factory: () => {
        const resolvedDeps = deps.map((depToken: any) =>
          this.resolve(depToken),
        );
        return new provider.useClass(...resolvedDeps);
      },
    });
  }

  resolve<T>(token: any): T {
    const provider = this.providers.get(token);

    if (!provider) {
      if (this.parent) {
        return this.parent.resolve<T>(token);
      }
      throw new Error(`Service not found for token: ${String(token)}`);
    }

    if (provider.scope === "singleton") {
      if (provider.instance === undefined) {
        provider.instance = provider.factory();
      }
      return provider.instance as T;
    }

    return provider.factory() as T;
  }

  has(token: any): boolean {
    return this.providers.has(token) || Boolean(this.parent?.has(token));
  }

  createScope(): Container {
    return new Container(this);
  }
}

export function Injectable(options?: { scope?: ProviderScope }) {
  return function <T extends ProviderClass>(target: T): void {
    Object.defineProperty(target, "__injectable", {
      value: {
        scope: options?.scope ?? "singleton",
      },
      configurable: false,
      enumerable: false,
      writable: false,
    });
  };
}

export function getInjectableScope(target: any): ProviderScope {
  return target?.__injectable?.scope ?? "singleton";
}

export const container = new Container();
