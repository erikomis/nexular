export type ModuleMetadata = {
  components?: any[];
  providers?: any[];
  imports?: any[];
};

export function Module(metadata: ModuleMetadata) {
  return function <T extends new (...args: any[]) => any>(target: T): void {
    Object.defineProperty(target, "__module", {
      value: metadata,
      configurable: false,
      enumerable: false,
      writable: false,
    });
  };
}

export function getModuleMetadata(target: any): ModuleMetadata | undefined {
  return target?.constructor?.__module ?? target?.__module;
}
