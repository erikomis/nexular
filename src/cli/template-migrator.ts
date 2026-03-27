import fs from "node:fs";
import path from "node:path";

export type LegacyTemplateMigrationResult = {
  filePath: string;
  replacements: number;
};

export type LegacyTemplateProjectMigrationResult = {
  filesChecked: number;
  filesChanged: number;
  totalReplacements: number;
  changes: LegacyTemplateMigrationResult[];
};

function convertLegacyIf(template: string): { output: string; replacements: number } {
  const ifRegex = /<([a-zA-Z][\w:-]*)([^>]*?)\s*\*if="([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/g;
  let replacements = 0;

  const output = template.replaceAll(
    ifRegex,
    (_match: string, tag: string, preAttrs: string, condition: string, postAttrs: string, inner: string) => {
      replacements += 1;
      return `@if (${condition.trim()}) {\n<${tag}${preAttrs}${postAttrs}>${inner}</${tag}>\n}`;
    }
  );

  return { output, replacements };
}

function convertLegacyFor(template: string): { output: string; replacements: number } {
  const forRegex =
    /<([a-zA-Z][\w:-]*)([^>]*?)\s*\*for="let\s+([a-zA-Z_$][\w$]*)\s+of\s+([^"]+)"([^>]*)>([\s\S]*?)<\/\1>/g;
  let replacements = 0;

  const output = template.replaceAll(
    forRegex,
    (_match: string, tag: string, preAttrs: string, item: string, source: string, postAttrs: string, inner: string) => {
      replacements += 1;
      return `@for (${item.trim()} of ${source.trim()}) {\n<${tag}${preAttrs}${postAttrs}>${inner}</${tag}>\n}`;
    }
  );

  return { output, replacements };
}

export function migrateLegacyTemplateContent(content: string): { content: string; replacements: number } {
  const convertedIf = convertLegacyIf(content);
  const convertedFor = convertLegacyFor(convertedIf.output);

  return {
    content: convertedFor.output,
    replacements: convertedIf.replacements + convertedFor.replacements,
  };
}

function shouldScanFile(filePath: string): boolean {
  return filePath.endsWith(".ts") || filePath.endsWith(".html");
}

function walkFiles(root: string, files: string[]): void {
  const entries = fs.readdirSync(root, { withFileTypes: true });

  entries.forEach((entry) => {
    if (["node_modules", "dist", "coverage", ".git"].includes(entry.name)) {
      return;
    }

    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      walkFiles(fullPath, files);
      return;
    }

    if (entry.isFile() && shouldScanFile(fullPath)) {
      files.push(fullPath);
    }
  });
}

export function migrateLegacyTemplatesInProject(
  rootDir: string,
  write = false
): LegacyTemplateProjectMigrationResult {
  const files: string[] = [];
  walkFiles(rootDir, files);

  const changes: LegacyTemplateMigrationResult[] = [];

  files.forEach((filePath) => {
    const original = fs.readFileSync(filePath, "utf8");
    const migrated = migrateLegacyTemplateContent(original);

    if (migrated.replacements === 0) {
      return;
    }

    if (write) {
      fs.writeFileSync(filePath, migrated.content, "utf8");
    }

    changes.push({
      filePath,
      replacements: migrated.replacements,
    });
  });

  return {
    filesChecked: files.length,
    filesChanged: changes.length,
    totalReplacements: changes.reduce((acc, item) => acc + item.replacements, 0),
    changes,
  };
}
