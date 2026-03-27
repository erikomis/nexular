import fs from 'node:fs';
import path from 'node:path';

function pascalCase(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
}

export function generateModule(name: string, outputDir = process.cwd()): string {
  const className = `${pascalCase(name)}Module`;
  const fileName = `${name}.module.ts`;
  const filePath = path.join(outputDir, fileName);

  const content = `import { Module } from '../app/core';\n\n@Module({\n  components: [],\n  providers: []\n})\nexport class ${className} {}\n`;

  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}
