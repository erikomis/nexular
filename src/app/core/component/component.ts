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
  if (typeof require !== "function") {
    return null;
  }

  try {
    const fs = require("fs") as NodeModules["fs"];
    const nodePath = require("path") as NodeModules["path"];
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
  return function <T extends new (...args: any[]) => any>(target: T): void {
    Object.defineProperty(target, "__metadata", {
      value: metadata,
      configurable: false,
      enumerable: false,
      writable: false,
    });
  };
}

export function getComponentMetadata(target: any): ComponentMetadata | undefined {
  return target?.constructor?.__metadata ?? target?.__metadata;
}
