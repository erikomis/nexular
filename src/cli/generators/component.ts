import fs from "node:fs";
import path from "node:path";

function pascalCase(name: string): string {
  return name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("");
}

export function generateComponent(name: string, outputDir = process.cwd()): string {
  const className = `${pascalCase(name)}Component`;
  const fileName = `${name}.component.ts`;
  const templateFileName = `${name}.component.html`;
  const styleFileName = `${name}.component.scss`;
  const filePath = path.join(outputDir, fileName);
  const templatePath = path.join(outputDir, templateFileName);
  const stylePath = path.join(outputDir, styleFileName);

  const content = `import { Component, signal } from '../app/core';\n\n@Component({\n  selector: 'app-${name}',\n  imports: [],\n  templateUrl: './${templateFileName}',\n  styleUrls: ['./${styleFileName}'],\n})\nexport class ${className} {\n  title = signal('${className} works!');\n}\n`;
  const templateContent = `<h2>{{ title }}</h2>\n`;
  const styleContent = `:host {\n  display: block;\n}\n`;

  fs.writeFileSync(filePath, content, "utf8");
  fs.writeFileSync(templatePath, templateContent, "utf8");
  fs.writeFileSync(stylePath, styleContent, "utf8");
  return filePath;
}
