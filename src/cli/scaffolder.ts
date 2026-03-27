import fs from "node:fs";
import path from "node:path";

type ScaffoldOptions = {
  frameworkDependency?: string;
  template?: "minimal" | "full" | "with-auth" | "showcase-i18n";
};

function scaffoldShowcaseI18nApp(projectPath: string): void {
  // Angular-like folder structure
  const appDir = path.join(projectPath, "src", "app");
  const coreDir = path.join(appDir, "core");
  const sharedDir = path.join(appDir, "shared");
  const featuresDir = path.join(appDir, "features");
  const homeFeatureDir = path.join(featuresDir, "home");
  const assetsDir = path.join(projectPath, "src", "assets");
  const environmentsDir = path.join(projectPath, "src", "environments");

  // Create directory structure
  fs.mkdirSync(path.join(coreDir, "services"), { recursive: true });
  fs.mkdirSync(path.join(coreDir, "guards"), { recursive: true });
  fs.mkdirSync(path.join(sharedDir, "components"), { recursive: true });
  fs.mkdirSync(path.join(sharedDir, "pipes"), { recursive: true });
  fs.mkdirSync(path.join(sharedDir, "directives"), { recursive: true });
  fs.mkdirSync(path.join(homeFeatureDir, "components"), { recursive: true });
  fs.mkdirSync(path.join(homeFeatureDir, "services"), { recursive: true });
  fs.mkdirSync(path.join(appDir, "routes"), { recursive: true });
  fs.mkdirSync(path.join(assetsDir, "styles"), { recursive: true });
  fs.mkdirSync(path.join(environmentsDir), { recursive: true });

  // Core: i18n service
  fs.writeFileSync(
    path.join(coreDir, "services", "i18n.service.ts"),
    `import { Injectable } from "nexular-framework";

export type Locale = "pt" | "en";

@Injectable({ scope: "singleton" })
export class I18nService {
  private currentLocale: Locale = "pt";

  setLocale(locale: Locale): void {
    this.currentLocale = locale;
  }

  getLocale(): Locale {
    return this.currentLocale;
  }

  t(key: string, params?: Record<string, any>): string {
    const messages = this.getMessages();
    let value = key.split(".").reduce((obj, k) => obj?.[k], messages as any);
    
    if (!value || typeof value !== "string") {
      return key;
    }

    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        value = value?.replace(\`\\\${\${k}}\`, String(v));
      });
    }

    return value;
  }

  private getMessages(): Record<string, any> {
    return {
      home: {
        hero: {
          tagline: this.currentLocale === "pt" ? "Starter Oficial Nexular" : "Nexular Official Starter",
          title: this.currentLocale === "pt" ? "UI showcase com i18n" : "UI Showcase with i18n",
          subtitle: this.currentLocale === "pt" 
            ? "Template pronto para SSR, MCP e fluxos modernos"
            : "Production-ready template for SSR, MCP, and modern patterns",
          cta: this.currentLocale === "pt" ? "Explorar" : "Explore",
        },
        features: {
          title: this.currentLocale === "pt" ? "O que está incluído" : "What's Included",
          items: [
            {
              id: "ssr",
              label: "SSR-first",
              desc: this.currentLocale === "pt"
                ? "Renderização no servidor com hydration"
                : "Server-side rendering with selective hydration",
            },
            {
              id: "mcp",
              label: "MCP integrado",
              desc: this.currentLocale === "pt"
                ? "Model Context Protocol para agentes IA"
                : "Model Context Protocol for AI agents",
            },
            {
              id: "i18n",
              label: "i18n pt/en",
              desc: this.currentLocale === "pt"
                ? "Suporte multilíngue nativo"
                : "Native multi-language support",
            },
          ],
        },
        status: this.currentLocale === "pt" ? "Estável" : "Stable",
      },
    };
  }
}
`
  );

  // Shared: locale switcher component - HTML template
  fs.writeFileSync(
    path.join(sharedDir, "components", "locale.switcher.component.html"),
    `<div class="locale-switcher">
  <span class="locale-label">{{ label }}</span>
  <a [href]="href" class="locale-link">
    {{ locale | uppercase }}
  </a>
</div>`
  );

  // Shared: locale switcher component - TS
  fs.writeFileSync(
    path.join(sharedDir, "components", "locale.switcher.component.ts"),
    `import { Component, Input } from "nexular-framework";

@Component({
  selector: "app-locale-switcher",
  imports: [],
  templateUrl: "./locale.switcher.component.html",
})
export class LocaleSwitcherComponent {
  @Input() locale!: string;
  @Input() href!: string;
  @Input() label!: string;
}`
  );

  // Shared: highlight directive
  fs.writeFileSync(
    path.join(sharedDir, "directives", "highlight.directive.ts"),
    `import { Directive, HostBinding, Input } from "nexular-framework";

@Directive({
  selector: "[appHighlight]",
})
export class HighlightDirective {
  @Input() appHighlight: boolean = false;

  @HostBinding("class.highlighted")
  get highlighted(): boolean {
    return this.appHighlight;
  }
}
`
  );

  // Feature: home showcase component
  fs.writeFileSync(
    path.join(homeFeatureDir, "components", "showcase.component.html"),
    `<section class="hero">
  <p class="eyebrow">{{ 'home.hero.tagline' | i18n }}</p>
  <h1>{{ 'home.hero.title' | i18n }}</h1>
  <p class="subtitle">{{ 'home.hero.subtitle' | i18n }}</p>
  <a href="#features" class="cta-button">
    {{ 'home.hero.cta' | i18n }}
  </a>
</section>

<section id="features" class="features">
  <h2>{{ 'home.features.title' | i18n }}</h2>
  <ul class="features-grid">
    @for (feature of features; track feature.id) {
      <li class="feature-card" [appHighlight]="isHighlighted(feature.id)">
        <strong>{{ feature.label }}</strong>
        <span>{{ feature.desc }}</span>
      </li>
    }
  </ul>
</section>

<section class="status">
  <p class="badge">{{ 'home.status' | i18n }}</p>
</section>`
  );

  fs.writeFileSync(
    path.join(homeFeatureDir, "components", "showcase.component.ts"),
    `import { Component, OnInit } from "nexular-framework";
import { I18nService } from "../../../core/services/i18n.service";

@Component({
  selector: "app-showcase",
  hydrate: "island",
  imports: [],
  templateUrl: "./showcase.component.html",
})
export class ShowcaseComponent implements OnInit {
  features: any[] = [];

  constructor(private i18n: I18nService) {}

  ngOnInit(): void {
    this.features = [
      {
        id: "ssr",
        label: "SSR-first",
        desc: this.i18n.t("home.features.items.0.desc"),
      },
      {
        id: "mcp",
        label: "MCP integrado",
        desc: this.i18n.t("home.features.items.1.desc"),
      },
      {
        id: "i18n",
        label: "i18n pt/en",
        desc: this.i18n.t("home.features.items.2.desc"),
      },
    ];
  }

  isHighlighted(id: string): boolean {
    return ["ssr", "i18n"].includes(id);
  }
}`
  );

  // Home feature: routes/page.ts
  fs.writeFileSync(
    path.join(appDir, "routes", "page.ts"),
    `import type { RouteContext } from "nexular-framework";
import { ShowcaseComponent } from "../features/home/components/showcase.component";

export const component = ShowcaseComponent;
export const revalidate = 60;
`
  );

  // Core: Routes configuration
  fs.writeFileSync(
    path.join(appDir, "routes.ts"),
    `import type { RouteConfig } from "nexular-framework";

export const routes: RouteConfig[] = [
  {
    path: "",
    component: "app-showcase",
    data: { title: "Home - Nexular Showcase" },
  },
];
`
  );

  // Shared: i18n pipe
  fs.writeFileSync(
    path.join(sharedDir, "pipes", "i18n.pipe.ts"),
    `import { Pipe, PipeTransform } from "nexular-framework";
import { I18nService } from "../../core/services/i18n.service";

@Pipe({
  name: "i18n",
})
export class I18nPipe implements PipeTransform {
  constructor(private i18n: I18nService) {}

  transform(key: string, params?: Record<string, any>): string {
    return this.i18n.t(key, params);
  }
}
`
  );

  // Global styles
  fs.writeFileSync(
    path.join(assetsDir, "styles", "global.css"),
    `:root {
  --nx-bg: #0f172a;
  --nx-surface: #1e293b;
  --nx-border: #334155;
  --nx-text: #f1f5f9;
  --nx-muted: #94a3b8;
  --nx-accent: #38bdf8;
  --nx-green: #4ade80;
  --nx-yellow: #facc15;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif;
  background: var(--nx-bg);
  color: var(--nx-text);
  line-height: 1.6;
}

.hero {
  text-align: center;
  padding: 60px 20px 40px;
  max-width: 900px;
  margin: 0 auto;
}

.eyebrow {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--nx-accent);
  margin-bottom: 16px;
  text-transform: uppercase;
}

.hero h1 {
  font-size: clamp(2rem, 5vw, 3.5rem);
  font-weight: 800;
  margin-bottom: 16px;
}

.subtitle {
  color: var(--nx-muted);
  font-size: 1.125rem;
  max-width: 600px;
  margin: 0 auto 32px;
}

.cta-button {
  display: inline-block;
  background: var(--nx-accent);
  color: var(--nx-bg);
  font-weight: 700;
  padding: 12px 28px;
  border-radius: 8px;
  text-decoration: none;
  transition: opacity 0.2s;
}

.cta-button:hover {
  opacity: 0.9;
}

.features {
  margin: 48px auto;
  max-width: 900px;
  padding: 0 20px;
}

.features h2 {
  font-size: 1.5rem;
  font-weight: 700;
  margin-bottom: 24px;
}

.features-grid {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.feature-card {
  background: var(--nx-surface);
  border: 1px solid var(--nx-border);
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: border-color 0.2s;
}

.feature-card.highlighted {
  border-color: var(--nx-accent);
}

.feature-card strong {
  font-size: 0.95rem;
}

.feature-card span {
  color: var(--nx-muted);
  font-size: 0.875rem;
}

.status {
  text-align: center;
  margin: 48px auto;
  max-width: 900px;
}

.badge {
  display: inline-block;
  padding: 6px 14px;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  background: var(--nx-surface);
  border: 1px solid var(--nx-accent);
  color: var(--nx-accent);
}

.locale-switcher {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.875rem;
}

.locale-link {
  color: var(--nx-accent);
  text-decoration: none;
  font-weight: 600;
}

.locale-link:hover {
  text-decoration: underline;
}`
  );

  // Environment config
  fs.writeFileSync(
    path.join(environmentsDir, "environment.ts"),
    `export const environment = {
  production: false,
  apiUrl: "http://localhost:3000",
  i18n: {
    defaultLocale: "pt",
    supportedLocales: ["pt", "en"],
  },
};
`
  );

  // Layout component (main app layout)
  fs.writeFileSync(
    path.join(appDir, "layout.ts"),
    [
      'import type { RouteContext } from "nexular-framework";',
      "",
      "export function renderLayout(content: string, ctx: RouteContext): string {",
      '  const switchLang = ctx.locale === "pt" ? "en" : "pt";',
      '  const switchLabel = ctx.locale === "pt" ? "EN" : "PT";',
      "  ",
      "  return `",
      "    <!DOCTYPE html>",
      '    <html lang="${ctx.locale}">',
      "      <head>",
      '        <meta charset="UTF-8">',
      '        <meta name="viewport" content="width=device-width, initial-scale=1.0">',
      "        <title>Nexular Showcase</title>",
      '        <link rel="stylesheet" href="/assets/styles/global.css">',
      "      </head>",
      "      <body>",
      '        <header style="display: flex; justify-content: space-between; align-items: center; padding: 20px; max-width: 900px; margin: 0 auto;">',
      '          <span style="font-weight: 700; font-size: 1.1rem;">Nexular</span>',
      '          <a href="?lang=${switchLang}" style="color: var(--nx-accent); text-decoration: none; font-weight: 600;">',
      "            ${switchLabel}",
      "          </a>",
      "        </header>",
      "        ${content}",
      '        <footer style="margin-top: 64px; padding: 24px 20px; border-top: 1px solid var(--nx-border); color: var(--nx-muted); font-size: 0.75rem; text-align: center; max-width: 900px; margin-left: auto; margin-right: auto;">',
      "          Nexular Framework &mdash; MIT License",
      "        </footer>",
      "      </body>",
      "    </html>",
      "  `;",
      "}",
      "",
      "export function loadData(ctx: RouteContext) {",
      "  return { locale: ctx.locale };",
      "}",
    ].join("\n")
  );

  // Main app.ts entry point
  fs.writeFileSync(
    path.join(appDir, "app.ts"),
    `import { I18nService } from "./core/services/i18n.service";
import { I18nPipe } from "./shared/pipes/i18n.pipe";
import { LocaleSwitcherComponent } from "./shared/components/locale.switcher.component";
import { HighlightDirective } from "./shared/directives/highlight.directive";
import { ShowcaseComponent } from "./features/home/components/showcase.component";

export const declarations = [
  ShowcaseComponent,
  LocaleSwitcherComponent,
  I18nPipe,
  HighlightDirective,
];

export const providers = [I18nService];
`
  );

  // README for the generated project
  fs.writeFileSync(
    path.join(appDir, "README.md"),
    `# Nexular Showcase - Angular-aligned Architecture

This starter follows Angular conventions with the following structure:

## Directory Structure

\`\`\`
src/app/
  ├── core/                  # Singleton services, guards
  │   └── services/
  │       └── i18n.service.ts
  ├── shared/                # Reusable components, pipes, directives
  │   ├── components/
  │   │   └── locale.switcher.component.ts
  │   ├── directives/
  │   │   └── highlight.directive.ts
  │   └── pipes/
  │       └── i18n.pipe.ts
  ├── features/              # Feature modules
  │   └── home/
  │       ├── components/
  │       │   └── showcase.component.ts
  │       └── services/
  ├── layout.ts              # Main layout
  ├── routes.ts              # Route configuration
  ├── app.ts                 # App declarations & providers
  └── routes/
      └── page.ts            # Home page component

src/assets/
  └── styles/
      └── global.css         # Global styles

src/environments/
  └── environment.ts         # Environment config

\`\`\`

## Key Features

- **SSR-first** with selective hydration
- **MCP Integration** for AI agents
- **i18n** native Portuguese (pt) and English (en) support
- **Modern Template Syntax** @if, @for, @switch
- **Angular-aligned Architecture** for familiar patterns
- **Dependency Injection** with singleton and transient scopes
- **TypeScript** with strict mode enabled

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

Visit http://localhost:3000 to see the showcase.
`
  );
}

export function scaffoldNewApp(projectName: string, options: ScaffoldOptions = {}): string {
  const projectPath = path.join(process.cwd(), projectName);
  const frameworkDependency =
    options.frameworkDependency ?? process.env.NEXULAR_FRAMEWORK_DEP ?? "file:..";
  const template = options.template ?? "full";
  const hasAuth = template === "full" || template === "with-auth" || template === "showcase-i18n";
  const hasInfraFiles = template !== "minimal";

  if (fs.existsSync(projectPath)) {
    throw new Error(`Project directory already exists: ${projectPath}`);
  }

  fs.mkdirSync(projectPath, { recursive: true });

  // tsconfig.json
  fs.writeFileSync(
    path.join(projectPath, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2020",
          module: "CommonJS",
          lib: ["ES2020"],
          outDir: "./dist",
          rootDir: "./src",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          resolveJsonModule: true,
          declaration: true,
          declarationMap: true,
          sourceMap: true,
        },
        include: ["src/**/*"],
        exclude: ["node_modules", "dist", "**/*.test.ts"],
      },
      null,
      2
    )
  );

  // .gitignore
  fs.writeFileSync(
    path.join(projectPath, ".gitignore"),
    `node_modules/
dist/
build/
.env.local
.env.*.local
.DS_Store
*.log
npm-debug.log*
yarn-debug.log*
.next/
out/
.cache/
.vercel/
.netlify/
.idea/
.vscode/
.env
`
  );

  // .env.example
  fs.writeFileSync(
    path.join(projectPath, ".env.example"),
    `# Nexular Runtime Configuration
NEXULAR_ENV=development
NODE_ENV=development

# Auth${hasAuth ? "" : " (optional)"}
NEXULAR_AUTH_PLUGINS=${hasAuth ? "bearer,api-key" : ""}
NEXULAR_AUTH_INTERNAL_TOKEN=your-internal-token-here
NEXULAR_AUTH_API_KEY=your-api-key-here

# Security (Production)
NEXULAR_OBSERVABILITY_TOKEN=your-observability-token
NEXULAR_SECURITY_CORS_ALLOW_LIST=https://localhost:3000,https://yourapp.com
NEXULAR_SECURITY_REQUIRE_PLUGIN_SIGNATURE=false

# Plugin Signature (Production)
NEXULAR_AUTH_PLUGIN_SIGNATURE_SECRET=your-plugin-secret
`
  );

  // .env.local (git-ignored)
  fs.writeFileSync(
    path.join(projectPath, ".env.local"),
    `# Copy from .env.example and fill in your values
`
  );

  // package.json
  fs.writeFileSync(
    path.join(projectPath, "package.json"),
    JSON.stringify(
      {
        name: projectName,
        version: "0.1.0",
        description: `Nexular app: ${projectName}`,
        main: "dist/index.js",
        scripts: {
          dev:
            template === "minimal"
              ? "echo 'Configure your app and run nexular commands'"
              : "npm run build && node dist/server/server.js",
          build: "tsc",
          start: "node dist/server/server.js",
          test: "vitest",
          release: "nexular release",
        },
        keywords: ["nexular", "ssr", "mcp"],
        author: "",
        license: "MIT",
        dependencies: {
          "nexular-framework": frameworkDependency,
        },
        devDependencies: {
          typescript: "^5.0.0",
          vitest: "^3.0.0",
        },
      },
      null,
      2
    )
  );

  if (hasInfraFiles) {
    // docker-compose.yml
    fs.writeFileSync(
      path.join(projectPath, "docker-compose.yml"),
      `version: '3.9'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      NEXULAR_ENV: production
    env_file:
      - .env.production
    volumes:
      - ./nexular.runtime.json:/app/nexular.runtime.json:ro
      - ./plugins:/app/plugins:ro
`
    );

    // Dockerfile
    fs.writeFileSync(
      path.join(projectPath, "Dockerfile"),
      `FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
COPY nexular.runtime.json .
COPY plugins ./plugins
EXPOSE 3000
CMD ["npm", "start"]
`
    );
  }

  // README.md
  fs.writeFileSync(
    path.join(projectPath, "README.md"),
    `# ${projectName}

Nexular web application.

## Development

\`\`\`bash
npm install
npm run dev
\`\`\`

## Testing

\`\`\`bash
npm test
\`\`\`

## Production

\`\`\`bash
npm run build
npm start
\`\`\`

### Docker

\`\`\`bash
docker-compose up --build
\`\`\`

## Configuration

See \`.env.example\` for runtime configuration options.
Copy to \`.env.local\` and customize for your environment.

Scaffold template: ${template}
`
  );

  // nexular.runtime.json
  fs.writeFileSync(
    path.join(projectPath, "nexular.runtime.json"),
    JSON.stringify(
      {
        default: {
          routeRules: [],
          auth: {
            plugins: hasAuth ? ["bearer", "api-key"] : [],
            pluginDirectory: "plugins/auth",
            pluginWhitelist: [],
            externalPlugins: [],
          },
          security: {
            corsAllowList: [],
            requirePluginSignature: false,
            observabilityToken: undefined,
          },
        },
        environments: {
          production: {
            auth: {
              plugins: hasAuth ? ["bearer", "api-key", "internal-token"] : [],
            },
            security: {
              requirePluginSignature: true,
            },
          },
        },
      },
      null,
      2
    )
  );

  if (hasAuth) {
    fs.mkdirSync(path.join(projectPath, "plugins", "auth"), { recursive: true });
  }

  if (template === "with-auth") {
    fs.writeFileSync(
      path.join(projectPath, "plugins", "auth", "example-auth.plugin.js"),
      `module.exports = {
  name: "example-auth",
  register() {
    return {
      authorize(ctx) {
        const token = ctx?.request?.headers?.authorization || "";
        return token.startsWith("Bearer ");
      },
    };
  },
};
`
    );
  }

  if (template === "showcase-i18n") {
    scaffoldShowcaseI18nApp(projectPath);
  }

  return projectPath;
}
