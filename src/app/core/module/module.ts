export type ModuleMetadata = {
  components?: unknown[];
  providers?: unknown[];
  imports?: unknown[];
};

export function Module(metadata: ModuleMetadata) {
  return function <T extends abstract new (...args: unknown[]) => unknown>(target: T): void {
    Object.defineProperty(target, "__module", {
      value: metadata,
      configurable: false,
      enumerable: false,
      writable: false,
    });
  };
}

type ModuleMetadataCarrier = {
  __module?: ModuleMetadata;
  constructor?: {
    __module?: ModuleMetadata;
  };
};

function asModuleMetadataCarrier(value: unknown): ModuleMetadataCarrier | null {
  if ((typeof value === "object" && value !== null) || typeof value === "function") {
    return value as ModuleMetadataCarrier;
  }

  return null;
}

export function getModuleMetadata(target: unknown): ModuleMetadata | undefined {
  const carrier = asModuleMetadataCarrier(target);
  if (!carrier) {
    return undefined;
  }

  return carrier.constructor?.__module ?? carrier.__module;
}
