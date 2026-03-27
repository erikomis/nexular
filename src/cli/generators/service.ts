import fs from 'node:fs';
import path from 'node:path';

function pascalCase(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

export function generateService(name: string, outputDir = process.cwd()): string {
  const className = `${pascalCase(name)}Service`;
  const fileName = `${name}.service.ts`;
  const filePath = path.join(outputDir, fileName);

  const content = [
    `import { Injectable } from '../../app/core';`,
    ``,
    `export interface ${className}Data {`,
    `  id: string;`,
    `  [key: string]: unknown;`,
    `}`,
    ``,
    `@Injectable({ scope: 'singleton' })`,
    `export class ${className} {`,
    `  private readonly store = new Map<string, ${className}Data>();`,
    ``,
    `  findAll(): ${className}Data[] {`,
    `    return Array.from(this.store.values());`,
    `  }`,
    ``,
    `  findById(id: string): ${className}Data | null {`,
    `    return this.store.get(id) ?? null;`,
    `  }`,
    ``,
    `  create(data: Omit<${className}Data, 'id'>): ${className}Data {`,
    `    const id = crypto.randomUUID();`,
    `    const record: ${className}Data = { ...data, id };`,
    `    this.store.set(id, record);`,
    `    return record;`,
    `  }`,
    ``,
    `  update(id: string, data: Partial<Omit<${className}Data, 'id'>>): ${className}Data | null {`,
    `    const existing = this.store.get(id);`,
    `    if (!existing) return null;`,
    `    const updated: ${className}Data = { ...existing, ...data, id };`,
    `    this.store.set(id, updated);`,
    `    return updated;`,
    `  }`,
    ``,
    `  delete(id: string): boolean {`,
    `    return this.store.delete(id);`,
    `  }`,
    `}`,
    ``,
  ].join('\n');

  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}
