type RequireLike = (moduleId: string) => unknown;

export type ComponentMetadata = {
  selector: string;
  template: string;
  templateUrl?: string;
  styleUrls?: string[];
  imports?: unknown[];
  hydrate?: "none" | "island" | "client";
};

export type ComponentConfig = Omit<ComponentMetadata, "template"> & {
  template?: string;
};

type NodeModules = {
  fs: {
    readFileSync(filePath: string, encoding: BufferEncoding): string;
  };
  path: {
    isAbsolute(filePath: string): boolean;
    resolve(...segments: string[]): string;
    relative(from: string, to: string): string;
    dirname(filePath: string): string;
  };
};

function loadNodeModules(): NodeModules | null {
  const globalRequire = (globalThis as { require?: RequireLike }).require;
  const requireLike: RequireLike | undefined =
    typeof require === "function" ? (require as RequireLike) : globalRequire;

  if (typeof requireLike !== "function") {
    return null;
  }

  try {
    const fs = requireLike("fs") as NodeModules["fs"];
    const nodePath = requireLike("path") as NodeModules["path"];
    return { fs, path: nodePath };
  } catch {
    return null;
  }
}

function resolveCallerDirectory(): string {
  const nodeModules = loadNodeModules();
  const stack = new Error().stack ?? "";
  const lines = stack.split("\n").slice(2);

  for (const line of lines) {
    const normalized = line.replace("file://", "");
    const match = normalized.match(/\(?((?:[A-Za-z]:)?\/[^():]+):(\d+):(\d+)\)?/);
    if (!match) {
      continue;
    }

    const filePath = match[1];
    if (
      filePath.endsWith("/component/component.ts") ||
      filePath.endsWith("\\component\\component.ts") ||
      filePath.endsWith("/component/component.js") ||
      filePath.endsWith("\\component\\component.js")
    ) {
      continue;
    }

    if (nodeModules) {
      return nodeModules.path.dirname(filePath);
    }

    return filePath.replace(/[\\/][^\\/]+$/, "");
  }

  return process.cwd();
}

function normalizeComponentMetadata(config: ComponentConfig): ComponentMetadata {
  const nodeModules = loadNodeModules();
  const callerDirectory = resolveCallerDirectory();
  const templatePath = config.templateUrl
    ? nodeModules
      ? nodeModules.path.isAbsolute(config.templateUrl)
        ? config.templateUrl
        : nodeModules.path.resolve(callerDirectory, config.templateUrl)
      : config.templateUrl
    : undefined;

  const template =
    config.template ??
    (templatePath && nodeModules ? nodeModules.fs.readFileSync(templatePath, "utf-8") : undefined);

  const runtimeTemplate = template ?? (!nodeModules && config.templateUrl ? "" : undefined);

  if (!runtimeTemplate) {
    throw new Error(
      "@Component requires either a 'template' string or a valid 'templateUrl' that is readable at runtime."
    );
  }

  const styleUrls = nodeModules
    ? config.styleUrls?.map((styleUrl) =>
        nodeModules.path.isAbsolute(styleUrl)
          ? styleUrl
          : nodeModules.path.relative(
              callerDirectory,
              nodeModules.path.resolve(callerDirectory, styleUrl)
            )
      )
    : config.styleUrls;

  return {
    selector: config.selector,
    template: runtimeTemplate,
    templateUrl: config.templateUrl,
    styleUrls,
    imports: config.imports,
    hydrate: config.hydrate,
  };
}

export function Component(config: ComponentConfig) {
  const metadata = normalizeComponentMetadata(config);
  return function <T extends abstract new (...args: unknown[]) => unknown>(target: T): void {
    Object.defineProperty(target, "__metadata", {
      value: metadata,
      configurable: false,
      enumerable: false,
      writable: false,
    });
  };
}

type MetadataCarrier = {
  __metadata?: ComponentMetadata;
  constructor?: {
    __metadata?: ComponentMetadata;
  };
};

function asMetadataCarrier(value: unknown): MetadataCarrier | null {
  if ((typeof value === "object" && value !== null) || typeof value === "function") {
    return value as MetadataCarrier;
  }

  return null;
}

export function getComponentMetadata(target: unknown): ComponentMetadata | undefined {
  const carrier = asMetadataCarrier(target);
  if (!carrier) {
    return undefined;
  }

  return carrier.constructor?.__metadata ?? carrier.__metadata;
}
