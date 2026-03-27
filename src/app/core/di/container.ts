export type ProviderScope = "singleton" | "transient";

type ClassToken<T = unknown> = abstract new (...args: never[]) => T;
type ClassConstructor<T = unknown> = new (...args: never[]) => T;

export type InjectionToken<T = unknown> = ClassToken<T> | symbol | string;

export type ProviderClass<T = unknown> = ClassConstructor<T>;
type InjectableClass<T = unknown> = ProviderClass<T> & { inject?: InjectionToken[] };

export type ClassProvider<T = unknown> = {
  useClass: InjectableClass<T>;
  scope?: ProviderScope;
  deps?: InjectionToken[];
};

type ProviderRecord = {
  factory: () => unknown;
  scope: ProviderScope;
  instance?: unknown;
};

export class Container {
  private readonly providers = new Map<InjectionToken, ProviderRecord>();

  constructor(private readonly parent?: Container) {}

  register<T>(token: InjectionToken<T>, instance: T): void {
    this.providers.set(token, {
      scope: "singleton",
      instance,
      factory: () => instance,
    });
  }

  registerClass<T>(token: InjectionToken<T>, provider: ClassProvider<T>): void {
    const scope = provider.scope ?? "singleton";
    const deps = provider.deps ?? provider.useClass.inject ?? [];

    this.providers.set(token, {
      scope,
      factory: () => {
        const resolvedDeps = deps.map((depToken) => this.resolve(depToken));
        return new provider.useClass(...(resolvedDeps as never[]));
      },
    });
  }

  resolve<T>(token: InjectionToken<T>): T {
    let provider = this.providers.get(token);

    // Support mixed runtime copies (e.g. framework src + app using framework dist)
    // by matching class/function tokens by name as a fallback.
    if (!provider && isClassToken(token) && token.name) {
      for (const [registeredToken, registeredProvider] of this.providers.entries()) {
        if (isClassToken(registeredToken) && registeredToken.name === token.name) {
          provider = registeredProvider;
          break;
        }
      }
    }

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

  has(token: InjectionToken): boolean {
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

type InjectableMetadataCarrier = {
  __injectable?: {
    scope?: ProviderScope;
  };
};

function isClassToken(token: InjectionToken): token is ProviderClass {
  return typeof token === "function";
}

export function getInjectableScope(target: unknown): ProviderScope {
  if (typeof target !== "object" && typeof target !== "function") {
    return "singleton";
  }

  const carrier = target as InjectableMetadataCarrier;
  return carrier.__injectable?.scope ?? "singleton";
}

export const container = new Container();
