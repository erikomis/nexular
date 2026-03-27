#!/usr/bin/env node
import path from "node:path";
import { scaffoldNewApp } from "./scaffolder";

function printHelp(): void {
  console.log("create-nexular");
  console.log("Usage:");
  console.log("  create-nexular <project-name>");
  console.log("  create-nexular <project-name> --framework-path <absolute-or-relative-path>");
  console.log("  create-nexular <project-name> --template <minimal|full|with-auth|showcase-i18n>");
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const index = args.findIndex((arg) => arg === flag);
  if (index < 0) return undefined;
  return args[index + 1];
}

function resolveFrameworkDependency(frameworkPathArg?: string): string {
  if (frameworkPathArg) {
    const resolved = path.resolve(process.cwd(), frameworkPathArg);
    return `file:${resolved}`;
  }

  const defaultFrameworkRoot = path.resolve(__dirname, "../..");
  return `file:${defaultFrameworkRoot}`;
}

function run(): void {
  const args = process.argv.slice(2);
  const projectName = args[0];

  if (!projectName || projectName === "-h" || projectName === "--help") {
    printHelp();
    return;
  }

  const frameworkPathArg = getFlagValue(args, "--framework-path");
  const templateArg = getFlagValue(args, "--template") as
    | "minimal"
    | "full"
    | "with-auth"
    | "showcase-i18n"
    | undefined;

  if (templateArg && !["minimal", "full", "with-auth", "showcase-i18n"].includes(templateArg)) {
    throw new Error("Invalid template. Use: minimal, full, with-auth or showcase-i18n");
  }

  const frameworkDependency = resolveFrameworkDependency(frameworkPathArg);
  const projectPath = scaffoldNewApp(projectName, {
    frameworkDependency,
    template: templateArg ?? "full",
  });

  console.log(`✓ Project created at ${projectPath}`);
  console.log(`✓ Using framework dependency: ${frameworkDependency}`);
  console.log(`✓ Template: ${templateArg ?? "full"}`);
  console.log("\nNext steps:");
  console.log(`  cd ${projectName}`);
  console.log("  npm install");
  console.log("  npm run dev");
}

run();
