import { getComponentMetadata } from "./component/component";
import { container } from "./di/container";
import { I18nService } from "./mcp/i18n";

export type HydrationMode = "none" | "island" | "client";

export type SSRRenderResult = {
  html: string;
  state: Record<string, unknown>;
  hydrate: HydrationMode;
  componentKey: string;
  islandId?: string;
};

export type TemplatePipeTransform = (value: unknown, ...args: unknown[]) => unknown;

export type TemplateDiagnostic = {
  level: "error" | "warning";
  code: string;
  message: string;
  line?: number;
  column?: number;
  snippet?: string;
};

export type TemplateRenderOutput = {
  html: string;
  diagnostics: TemplateDiagnostic[];
};

const templatePipes = new Map<string, TemplatePipeTransform>([
  ["uppercase", (value) => String(value ?? "").toUpperCase()],
  ["lowercase", (value) => String(value ?? "").toLowerCase()],
  [
    "titlecase",
    (value) =>
      String(value ?? "")
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase()),
  ],
  ["json", (value) => JSON.stringify(value ?? null, null, 2)],
  [
    "slice",
    (value, start, end) => {
      const s = Number(start ?? 0);
      const e = end === undefined || end === null ? undefined : Number(end);
      if (typeof value === "string") {
        return value.slice(s, e);
      }
      if (Array.isArray(value)) {
        return value.slice(s, e);
      }
      return value;
    },
  ],
  [
    "number",
    (value, locale = undefined, fractionDigits = undefined) => {
      const numeric = Number(value);
      if (Number.isNaN(numeric)) {
        return value;
      }

      const options: Intl.NumberFormatOptions = {};
      if (fractionDigits !== undefined && fractionDigits !== null && fractionDigits !== "") {
        const digits = Number(fractionDigits);
        if (!Number.isNaN(digits)) {
          options.minimumFractionDigits = digits;
          options.maximumFractionDigits = digits;
        }
      }

      return new Intl.NumberFormat(
        typeof locale === "string" && locale ? locale : undefined,
        options
      ).format(numeric);
    },
  ],
  [
    "percent",
    (value, locale = undefined) => {
      const numeric = Number(value);
      if (Number.isNaN(numeric)) {
        return value;
      }

      return new Intl.NumberFormat(typeof locale === "string" && locale ? locale : undefined, {
        style: "percent",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(numeric);
    },
  ],
  [
    "currency",
    (value, code = "USD", locale = undefined) => {
      const numeric = Number(value);
      if (Number.isNaN(numeric)) {
        return value;
      }

      const currencyCode = typeof code === "string" && code ? code : "USD";

      return new Intl.NumberFormat(typeof locale === "string" && locale ? locale : undefined, {
        style: "currency",
        currency: currencyCode,
      }).format(numeric);
    },
  ],
  [
    "date",
    (value, format = "medium", locale = undefined) => {
      const date = value instanceof Date ? value : new Date(String(value));
      if (Number.isNaN(date.getTime())) {
        return value;
      }

      const normalizedFormat = String(format ?? "medium").toLowerCase();
      const options: Intl.DateTimeFormatOptions =
        normalizedFormat === "short"
          ? { dateStyle: "short" }
          : normalizedFormat === "long"
            ? { dateStyle: "long" }
            : normalizedFormat === "full"
              ? { dateStyle: "full" }
              : { dateStyle: "medium" };

      return new Intl.DateTimeFormat(
        typeof locale === "string" && locale ? locale : undefined,
        options
      ).format(date);
    },
  ],
]);

export function registerTemplatePipe(name: string, transform: TemplatePipeTransform): void {
  templatePipes.set(name.trim(), transform);
}

export function unregisterTemplatePipe(name: string): void {
  templatePipes.delete(name.trim());
}

export function listTemplatePipes(): string[] {
  return Array.from(templatePipes.keys());
}

function isSignalLike(value: unknown): value is {
  (): unknown;
  set: (next: unknown) => void;
  subscribe: (fn: () => void) => () => void;
} {
  return (
    typeof value === "function" && Boolean((value as any).set) && Boolean((value as any).subscribe)
  );
}

function parseClassValue(value: unknown): string[] {
  if (!value) {
    return [];
  }

  if (typeof value === "string") {
    return value
      .split(/\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([className]) => className)
      .filter(Boolean);
  }

  return [];
}

function parseStyleValue(style: string): Record<string, string> {
  const map: Record<string, string> = {};

  style
    .split(";")
    .map((rule) => rule.trim())
    .filter(Boolean)
    .forEach((rule) => {
      const [property, ...rest] = rule.split(":");
      const value = rest.join(":").trim();
      if (property && value) {
        map[property.trim()] = value;
      }
    });

  return map;
}

function stringifyStyleValue(styleMap: Record<string, string>): string {
  return Object.entries(styleMap)
    .map(([property, value]) => `${property}: ${value}`)
    .join("; ");
}

function parseStyleBindingValue(value: unknown): Record<string, string> {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    return parseStyleValue(value);
  }

  if (typeof value === "object") {
    const result: Record<string, string> = {};
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      if (item === undefined || item === null || item === false || item === "") {
        return;
      }
      result[key] = String(item);
    });
    return result;
  }

  return {};
}

function parseAttrBindingValue(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const result: Record<string, string> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    if (item === undefined || item === null || item === false) {
      return;
    }
    result[key] = String(item);
  });

  return result;
}

function processPropertyBindings(template: string, context: Record<string, any>): string {
  const openingTagRegex = /<([a-zA-Z][\w:-]*)([^<>]*?)>/g;

  return template.replace(
    openingTagRegex,
    (fullMatch: string, tagName: string, rawAttrs: string) => {
      let attrs = rawAttrs;
      const selfClosing = /\s\/$/.test(attrs);
      if (selfClosing) {
        attrs = attrs.replace(/\s\/$/, "");
      }

      const classSet = new Set<string>();
      const styleMap: Record<string, string> = {};
      const attrMap: Record<string, string> = {};

      const existingClassMatch = attrs.match(/\sclass="([^"]*)"/);
      if (existingClassMatch) {
        parseClassValue(existingClassMatch[1]).forEach((className) => classSet.add(className));
        attrs = attrs.replace(/\sclass="[^"]*"/, "");
      }

      const existingStyleMatch = attrs.match(/\sstyle="([^"]*)"/);
      if (existingStyleMatch) {
        Object.assign(styleMap, parseStyleValue(existingStyleMatch[1]));
        attrs = attrs.replace(/\sstyle="[^"]*"/, "");
      }

      attrs = attrs.replace(/\s\[class\]="([^"]+)"/g, (_match: string, expression: string) => {
        parseClassValue(evaluateExpression(expression, context)).forEach((className) => {
          classSet.add(className);
        });
        return "";
      });

      attrs = attrs.replace(/\s\[style\]="([^"]+)"/g, (_match: string, expression: string) => {
        Object.assign(styleMap, parseStyleBindingValue(evaluateExpression(expression, context)));
        return "";
      });

      attrs = attrs.replace(/\s\[attr\]="([^"]+)"/g, (_match: string, expression: string) => {
        Object.assign(attrMap, parseAttrBindingValue(evaluateExpression(expression, context)));
        return "";
      });

      attrs = attrs.replace(
        /\s\[class\.([\w-]+)\]="([^"]+)"/g,
        (_match: string, className: string, expression: string) => {
          if (Boolean(evaluateExpression(expression, context))) {
            classSet.add(className);
          } else {
            classSet.delete(className);
          }
          return "";
        }
      );

      attrs = attrs.replace(
        /\s\[style\.([\w-]+)\]="([^"]+)"/g,
        (_match: string, styleName: string, expression: string) => {
          const value = evaluateExpression(expression, context);
          if (value === undefined || value === null || value === false || value === "") {
            delete styleMap[styleName];
          } else {
            styleMap[styleName] = String(value);
          }
          return "";
        }
      );

      attrs = attrs.replace(
        /\s\[attr\.([A-Za-z_][-A-Za-z0-9_:.]*)\]="([^"]+)"/g,
        (_match: string, attrName: string, expression: string) => {
          const value = evaluateExpression(expression, context);
          if (value === undefined || value === null || value === false) {
            delete attrMap[attrName];
          } else {
            attrMap[attrName] = String(value);
          }
          return "";
        }
      );

      let normalizedAttrs = attrs.replace(/\s+/g, " ").trim();
      const rebuilt: string[] = [];

      if (normalizedAttrs) {
        rebuilt.push(normalizedAttrs);
      }

      if (classSet.size > 0) {
        rebuilt.push(`class="${escapeAttribute(Array.from(classSet).join(" "))}"`);
      }

      const styleValue = stringifyStyleValue(styleMap);
      if (styleValue) {
        rebuilt.push(`style="${escapeAttribute(styleValue)}"`);
      }

      Object.entries(attrMap).forEach(([name, value]) => {
        rebuilt.push(`${name}="${escapeAttribute(value)}"`);
      });

      const suffix = selfClosing ? " /" : "";
      const finalAttrs = rebuilt.length > 0 ? ` ${rebuilt.join(" ")}` : "";

      return `<${tagName}${finalAttrs}${suffix}>`;
    }
  );
}

function processNextAtSwitchBlock(template: string, context: Record<string, any>): string {
  const switchIndex = template.indexOf("@switch");
  if (switchIndex === -1) {
    return template;
  }

  const openParenIndex = template.indexOf("(", switchIndex);
  if (openParenIndex === -1) {
    throw createTemplateSyntaxError(
      "SWITCH_MISSING_PAREN",
      template,
      switchIndex,
      "@switch requires a condition wrapped in parentheses."
    );
  }

  const closeParenIndex = findMatchingDelimiter(template, openParenIndex, "(", ")");
  if (closeParenIndex === -1) {
    throw createTemplateSyntaxError(
      "SWITCH_UNCLOSED_PAREN",
      template,
      openParenIndex,
      "@switch condition has an unclosed parenthesis."
    );
  }

  const openBraceIndex = skipWhitespace(template, closeParenIndex + 1);
  if (template[openBraceIndex] !== "{") {
    throw createTemplateSyntaxError(
      "SWITCH_MISSING_BLOCK",
      template,
      closeParenIndex,
      "@switch requires a block body wrapped in braces."
    );
  }

  const closeBraceIndex = findMatchingDelimiter(template, openBraceIndex, "{", "}");
  if (closeBraceIndex === -1) {
    throw createTemplateSyntaxError(
      "SWITCH_UNCLOSED_BLOCK",
      template,
      openBraceIndex,
      "@switch block has an unclosed brace."
    );
  }

  const switchValue = evaluateExpression(
    template.slice(openParenIndex + 1, closeParenIndex),
    context
  );
  const body = template.slice(openBraceIndex + 1, closeBraceIndex);

  let cursor = 0;
  let selectedBody = "";
  let defaultBody = "";

  while (cursor < body.length) {
    const next = skipWhitespace(body, cursor);

    if (body.startsWith("@case", next)) {
      const caseOpenParen = body.indexOf("(", next);
      if (caseOpenParen === -1) break;

      const caseCloseParen = findMatchingDelimiter(body, caseOpenParen, "(", ")");
      if (caseCloseParen === -1) break;

      const caseOpenBrace = skipWhitespace(body, caseCloseParen + 1);
      if (body[caseOpenBrace] !== "{") break;

      const caseCloseBrace = findMatchingDelimiter(body, caseOpenBrace, "{", "}");
      if (caseCloseBrace === -1) break;

      const caseExpression = body.slice(caseOpenParen + 1, caseCloseParen);
      const caseValue = evaluateExpression(caseExpression, context);

      if (selectedBody === "" && switchValue === caseValue) {
        selectedBody = body.slice(caseOpenBrace + 1, caseCloseBrace);
      }

      cursor = caseCloseBrace + 1;
      continue;
    }

    if (body.startsWith("@default", next)) {
      const defaultOpenBrace = skipWhitespace(body, next + "@default".length);
      if (body[defaultOpenBrace] !== "{") break;

      const defaultCloseBrace = findMatchingDelimiter(body, defaultOpenBrace, "{", "}");
      if (defaultCloseBrace === -1) break;

      defaultBody = body.slice(defaultOpenBrace + 1, defaultCloseBrace);
      cursor = defaultCloseBrace + 1;
      continue;
    }

    break;
  }

  const rendered = renderTemplate(selectedBody || defaultBody, context);
  return `${template.slice(0, switchIndex)}${rendered}${template.slice(closeBraceIndex + 1)}`;
}

function resolvePath(path: string, context: Record<string, any>): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current && typeof current === "object" && key in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, context);
}

function splitByDelimiter(expression: string, delimiter: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let depthParen = 0;
  let depthBracket = 0;
  let depthBrace = 0;

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];
    const previous = expression[index - 1];

    if (quote) {
      current += char;
      if (char === quote && previous !== "\\") {
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"') {
      quote = char;
      current += char;
      continue;
    }

    if (char === "(") depthParen += 1;
    if (char === ")") depthParen = Math.max(0, depthParen - 1);
    if (char === "[") depthBracket += 1;
    if (char === "]") depthBracket = Math.max(0, depthBracket - 1);
    if (char === "{") depthBrace += 1;
    if (char === "}") depthBrace = Math.max(0, depthBrace - 1);

    const isTopLevel = depthParen === 0 && depthBracket === 0 && depthBrace === 0;

    if (
      isTopLevel &&
      delimiter === "|" &&
      char === "|" &&
      expression[index + 1] !== "|" &&
      previous !== "|"
    ) {
      const part = current.trim();
      if (part) {
        parts.push(part);
      }
      current = "";
      continue;
    }

    if (isTopLevel && delimiter === ":" && char === ":") {
      const part = current.trim();
      if (part) {
        parts.push(part);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const tail = current.trim();
  if (tail) {
    parts.push(tail);
  }

  return parts;
}

function applyPipe(name: string, value: unknown, args: unknown[]): unknown {
  const pipe = templatePipes.get(name.trim());
  if (!pipe) {
    const available = listTemplatePipes().sort().join(", ");
    throw new Error(`Unknown template pipe: ${name}. Available pipes: ${available}`);
  }

  return pipe(value, ...args);
}

function evaluateExpression(expression: string, context: Record<string, any>): unknown {
  const normalized = expression.trim();

  const piped = splitByDelimiter(normalized, "|");
  if (piped.length > 1) {
    let current = evaluateExpression(piped[0], context);

    for (const segment of piped.slice(1)) {
      const [pipeName, ...argExpressions] = splitByDelimiter(segment, ":");
      const args = argExpressions.map((argExpression) =>
        evaluateExpression(argExpression, context)
      );
      current = applyPipe(pipeName, current, args);
    }

    return current;
  }

  const quoted = normalized.match(/^['"](.*)['"]$/);
  if (quoted) {
    return quoted[1];
  }

  if (normalized === "true") return true;
  if (normalized === "false") return false;
  if (normalized === "null") return null;
  if (normalized !== "" && !Number.isNaN(Number(normalized))) {
    return Number(normalized);
  }

  if (normalized.startsWith("!")) {
    return !Boolean(evaluateExpression(normalized.slice(1), context));
  }

  const fnCallMatch = normalized.match(/^([\w$.]+)\((.*)\)$/);
  if (fnCallMatch) {
    const fnName = fnCallMatch[1];
    const argsRaw = fnCallMatch[2].trim();
    const fn = resolvePath(fnName, context);

    if (typeof fn !== "function") {
      return undefined;
    }

    if (!argsRaw) {
      return fn.call(context);
    }

    const args = argsRaw
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean)
      .map((token) => {
        const quoted = token.match(/^['\"](.*)['\"]$/);
        if (quoted) {
          return quoted[1];
        }

        if (token === "true") return true;
        if (token === "false") return false;
        if (!Number.isNaN(Number(token))) return Number(token);
        return resolvePath(token, context);
      });

    return fn.call(context, ...args);
  }

  return resolvePath(normalized, context);
}

function skipWhitespace(template: string, start: number): number {
  let index = start;
  while (index < template.length && /\s/.test(template[index])) {
    index += 1;
  }
  return index;
}

function findMatchingDelimiter(
  template: string,
  openIndex: number,
  openChar: string,
  closeChar: string
): number {
  let depth = 0;

  for (let index = openIndex; index < template.length; index += 1) {
    if (template.startsWith("{{", index) || template.startsWith("}}", index)) {
      index += 1;
      continue;
    }

    const char = template[index];
    if (char === openChar) {
      depth += 1;
      continue;
    }

    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function parseForHeader(header: string): { itemName: string; listExpression: string } | null {
  const normalized = header.trim();
  const mainSegment = normalized.split(";")[0]?.trim() ?? "";
  const match = mainSegment.match(/^([A-Za-z_$][\w$]*)\s+of\s+(.+)$/);

  if (!match) {
    return null;
  }

  return {
    itemName: match[1].trim(),
    listExpression: match[2].trim(),
  };
}

function processNextAtForBlock(template: string, context: Record<string, any>): string {
  const forIndex = template.indexOf("@for");
  if (forIndex === -1) {
    return template;
  }

  const openParenIndex = template.indexOf("(", forIndex);
  if (openParenIndex === -1) {
    throw createTemplateSyntaxError(
      "FOR_MISSING_PAREN",
      template,
      forIndex,
      "@for requires a header wrapped in parentheses."
    );
  }

  const closeParenIndex = findMatchingDelimiter(template, openParenIndex, "(", ")");
  if (closeParenIndex === -1) {
    throw createTemplateSyntaxError(
      "FOR_UNCLOSED_PAREN",
      template,
      openParenIndex,
      "@for header has an unclosed parenthesis."
    );
  }

  const openBraceIndex = skipWhitespace(template, closeParenIndex + 1);
  if (template[openBraceIndex] !== "{") {
    throw createTemplateSyntaxError(
      "FOR_MISSING_BLOCK",
      template,
      closeParenIndex,
      "@for requires a block body wrapped in braces."
    );
  }

  const closeBraceIndex = findMatchingDelimiter(template, openBraceIndex, "{", "}");
  if (closeBraceIndex === -1) {
    throw createTemplateSyntaxError(
      "FOR_UNCLOSED_BLOCK",
      template,
      openBraceIndex,
      "@for block has an unclosed brace."
    );
  }

  const header = template.slice(openParenIndex + 1, closeParenIndex);
  const parsedHeader = parseForHeader(header);
  if (!parsedHeader) {
    throw createTemplateSyntaxError(
      "FOR_INVALID_HEADER",
      template,
      openParenIndex,
      "@for header must follow the pattern: (item of expression; ...)."
    );
  }

  const inner = template.slice(openBraceIndex + 1, closeBraceIndex);
  const list = evaluateExpression(parsedHeader.listExpression, context);

  const rendered = Array.isArray(list)
    ? list
        .map((item, index) => {
          const localContext = {
            ...context,
            [parsedHeader.itemName]: item,
            $index: index,
          };
          return renderTemplate(inner, localContext);
        })
        .join("")
    : "";

  return `${template.slice(0, forIndex)}${rendered}${template.slice(closeBraceIndex + 1)}`;
}

function processNextAtIfBlock(template: string, context: Record<string, any>): string {
  const ifIndex = template.indexOf("@if");
  if (ifIndex === -1) {
    return template;
  }

  const parseConditionBlock = (from: number) => {
    const openParen = template.indexOf("(", from);
    if (openParen === -1) return null;
    const closeParen = findMatchingDelimiter(template, openParen, "(", ")");
    if (closeParen === -1) return null;

    const openBrace = skipWhitespace(template, closeParen + 1);
    if (template[openBrace] !== "{") return null;

    const closeBrace = findMatchingDelimiter(template, openBrace, "{", "}");
    if (closeBrace === -1) return null;

    return {
      condition: template.slice(openParen + 1, closeParen).trim(),
      body: template.slice(openBrace + 1, closeBrace),
      end: closeBrace + 1,
    };
  };

  const first = parseConditionBlock(ifIndex);
  if (!first) {
    throw createTemplateSyntaxError(
      "IF_INVALID_BLOCK",
      template,
      ifIndex,
      "@if must be written as @if (condition) { ... }."
    );
  }

  const branches: Array<{ condition?: string; body: string }> = [
    {
      condition: first.condition,
      body: first.body,
    },
  ];

  let cursor = first.end;

  while (true) {
    const next = skipWhitespace(template, cursor);

    if (template.startsWith("@else if", next)) {
      const elseIf = parseConditionBlock(next + "@else ".length);
      if (!elseIf) {
        throw createTemplateSyntaxError(
          "ELSE_IF_INVALID_BLOCK",
          template,
          next,
          "@else if must be written as @else if (condition) { ... }."
        );
      }

      branches.push({
        condition: elseIf.condition,
        body: elseIf.body,
      });
      cursor = elseIf.end;
      continue;
    }

    if (template.startsWith("@else", next)) {
      const openBrace = skipWhitespace(template, next + "@else".length);
      if (template[openBrace] !== "{") {
        throw createTemplateSyntaxError(
          "ELSE_MISSING_BLOCK",
          template,
          next,
          "@else must be followed by a block: @else { ... }."
        );
      }

      const closeBrace = findMatchingDelimiter(template, openBrace, "{", "}");
      if (closeBrace === -1) {
        throw createTemplateSyntaxError(
          "ELSE_UNCLOSED_BLOCK",
          template,
          openBrace,
          "@else block has an unclosed brace."
        );
      }

      branches.push({
        body: template.slice(openBrace + 1, closeBrace),
      });
      cursor = closeBrace + 1;
    }

    break;
  }

  let selected = "";
  for (const branch of branches) {
    if (!branch.condition) {
      selected = branch.body;
      break;
    }

    if (evaluateExpression(branch.condition, context)) {
      selected = branch.body;
      break;
    }
  }

  const rendered = selected ? renderTemplate(selected, context) : "";
  return `${template.slice(0, ifIndex)}${rendered}${template.slice(cursor)}`;
}

function processModernControlFlow(template: string, context: Record<string, any>): string {
  let current = template;

  while (true) {
    const next = processNextAtSwitchBlock(
      processNextAtIfBlock(processNextAtForBlock(current, context), context),
      context
    );
    if (next === current) {
      return next;
    }
    current = next;
  }
}

function processForBlocks(template: string, context: Record<string, any>): string {
  const forRegex = /<nx-for\s+each="(\w+)\s+in\s+([^"]+)"\s*>([\s\S]*?)<\/nx-for>/g;

  return template.replace(
    forRegex,
    (_match: string, itemName: string, listExpression: string, inner: string) => {
      const list = evaluateExpression(listExpression, context);
      if (!Array.isArray(list) || list.length === 0) {
        return "";
      }

      return list
        .map((item) => {
          const localContext = {
            ...context,
            [itemName]: item,
          };
          return renderTemplate(inner, localContext);
        })
        .join("");
    }
  );
}

function processIfBlocks(template: string, context: Record<string, any>): string {
  const ifRegex = /<nx-if\s+when="([^"]+)"\s*>([\s\S]*?)<\/nx-if>/g;

  return template.replace(ifRegex, (_match: string, conditionExpression: string, inner: string) => {
    const condition = evaluateExpression(conditionExpression, context);
    if (condition) {
      return renderTemplate(inner, context);
    }
    return "";
  });
}

function processInterpolation(template: string, context: Record<string, any>): string {
  return template.replace(/{{\s*([^}]+)\s*}}/g, (_match: string, expression: string) => {
    const rawValue = evaluateExpression(expression, context);

    if (typeof rawValue === "function") {
      try {
        return String(rawValue());
      } catch {
        return "";
      }
    }

    return rawValue === undefined || rawValue === null ? "" : String(rawValue);
  });
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function processControlBindings(template: string, context: Record<string, any>): string {
  // Alias Angular-like syntax to internal model-binding attribute.
  let result = template.replace(
    /\[\(ngModel\)\]="([^"]+)"/g,
    (_match: string, expression: string) => {
      return `data-nx-model="${expression}"`;
    }
  );

  result = result.replace(/ngModelGroup="([^"]+)"/g, (_match: string, expression: string) => {
    return `data-nx-model-group="${expression}"`;
  });

  result = result.replace(
    /<([a-zA-Z][\w:-]*)\b([^>]*data-nx-model-group="([^"]+)"[^>]*)>([\s\S]*?)<\/\1>/g,
    (_fullMatch: string, tagName: string, attrs: string, groupExprRaw: string, inner: string) => {
      const groupExpr = groupExprRaw.trim();
      const normalizedInner = inner.replace(
        /data-nx-model="([^"]+)"/g,
        (_innerMatch: string, modelExpr: string) => {
          const trimmed = modelExpr.trim();

          if (trimmed.startsWith(`${groupExpr}.`)) {
            return `data-nx-model="${trimmed}"`;
          }

          if (/^[A-Za-z_$][\w$]*$/.test(trimmed)) {
            return `data-nx-model="${groupExpr}.${trimmed}"`;
          }

          return `data-nx-model="${trimmed}"`;
        }
      );

      return `<${tagName}${attrs}>${normalizedInner}</${tagName}>`;
    }
  );

  result = result.replace(/nx-control="([^"]+)"/g, (_match: string, expression: string) => {
    const control = evaluateExpression(expression, context) as
      | { value?: () => unknown; setValue?: (value: unknown) => void }
      | undefined;

    if (!control || typeof control.value !== "function" || typeof control.setValue !== "function") {
      return "";
    }

    const currentValue = control.value();
    const serialized =
      currentValue === undefined || currentValue === null
        ? ""
        : escapeAttribute(String(currentValue));

    return `data-nx-control="${expression}" value="${serialized}"`;
  });

  return result;
}

function processEventBindings(template: string): string {
  let result = template;

  // Angular-like alias for submit events.
  result = result.replace(/\(ngSubmit\)=/g, "(submit)=");

  result = result.replace(
    /\((click|input|change|submit)\)="([\w$.]+)\(\)"/g,
    (_match: string, eventName: string, handlerName: string) => {
      return `data-nx-on-${eventName}="${handlerName}"`;
    }
  );

  return result;
}

function extractState(instance: Record<string, any>): Record<string, unknown> {
  const state: Record<string, unknown> = {};

  Object.keys(instance).forEach((key) => {
    const value = instance[key];

    if (isSignalLike(value)) {
      state[key] = value();
      return;
    }

    if (typeof value !== "function") {
      state[key] = value;
    }
  });

  return state;
}

export function applyState(instance: Record<string, any>, state: Record<string, unknown>): void {
  Object.entries(state).forEach(([key, value]) => {
    const target = instance[key];

    if (isSignalLike(target)) {
      target.set(value);
      return;
    }

    if (typeof target !== "function") {
      instance[key] = value;
    }
  });
}

export function renderTemplate(template: string, context: Record<string, any>): string {
  let result = template;

  result = processModernControlFlow(result, context);
  result = processForBlocks(result, context);
  result = processIfBlocks(result, context);
  result = processPropertyBindings(result, context);
  result = processControlBindings(result, context);
  result = processInterpolation(result, context);
  result = processEventBindings(result);

  return result;
}

export function renderTemplateWithDiagnostics(
  template: string,
  context: Record<string, any>
): TemplateRenderOutput {
  const diagnostics = analyzeTemplateDiagnostics(template);
  const html = renderTemplate(template, context);

  return {
    html,
    diagnostics,
  };
}

export function analyzeTemplateDiagnostics(template: string): TemplateDiagnostic[] {
  const diagnostics: TemplateDiagnostic[] = [];

  const bindingRegex = /\[([^\]=]+)\]="([^"]*)"/g;
  let bindingMatch: RegExpExecArray | null;
  while ((bindingMatch = bindingRegex.exec(template)) !== null) {
    const target = bindingMatch[1].trim();
    const expression = bindingMatch[2].trim();
    const index = bindingMatch.index;

    if (!expression) {
      diagnostics.push(
        createDiagnostic(
          "error",
          "BINDING_EMPTY_EXPRESSION",
          `Binding [${target}] has an empty expression.`,
          template,
          index
        )
      );
      continue;
    }

    if (target === "class" || target === "style" || target === "attr") {
      continue;
    }

    if (target.startsWith("class.") && target.length === "class.".length) {
      diagnostics.push(
        createDiagnostic(
          "error",
          "BINDING_INVALID_CLASS_TARGET",
          "Binding [class.*] must include a class name (example: [class.active]).",
          template,
          index
        )
      );
      continue;
    }

    if (target.startsWith("style.") && target.length === "style.".length) {
      diagnostics.push(
        createDiagnostic(
          "error",
          "BINDING_INVALID_STYLE_TARGET",
          "Binding [style.*] must include a CSS property (example: [style.color]).",
          template,
          index
        )
      );
      continue;
    }

    if (target.startsWith("attr.") && target.length === "attr.".length) {
      diagnostics.push(
        createDiagnostic(
          "error",
          "BINDING_INVALID_ATTR_TARGET",
          "Binding [attr.*] must include an attribute name (example: [attr.aria-label]).",
          template,
          index
        )
      );
      continue;
    }

    if (
      !(target.startsWith("class.") || target.startsWith("style.") || target.startsWith("attr."))
    ) {
      diagnostics.push(
        createDiagnostic(
          "warning",
          "BINDING_UNKNOWN_TARGET",
          `Binding target [${target}] is not recognized by the renderer.`,
          template,
          index
        )
      );
    }
  }

  const interpolationRegex = /{{\s*([^}]+)\s*}}/g;
  let interpolationMatch: RegExpExecArray | null;
  while ((interpolationMatch = interpolationRegex.exec(template)) !== null) {
    const expression = interpolationMatch[1].trim();
    const segments = splitByDelimiter(expression, "|");

    if (segments.length <= 1) {
      continue;
    }

    for (const segment of segments.slice(1)) {
      const [pipeName] = splitByDelimiter(segment, ":");
      const normalized = pipeName.trim();
      if (!templatePipes.has(normalized)) {
        diagnostics.push(
          createDiagnostic(
            "error",
            "PIPE_UNKNOWN",
            `Pipe \"${normalized}\" is not registered.`,
            template,
            interpolationMatch.index
          )
        );
      }
    }
  }

  try {
    processModernControlFlow(template, {});
  } catch (error) {
    if (error instanceof Error) {
      diagnostics.push({
        level: "error",
        code: "PARSER_SYNTAX",
        message: error.message,
      });
    }
  }

  return diagnostics;
}

function createTemplateSyntaxError(
  code: string,
  template: string,
  index: number,
  detail: string
): Error {
  const location = toLineColumn(template, index);
  const snippet = template.slice(Math.max(0, index - 24), Math.min(template.length, index + 48));

  return new Error(
    `[${code}] ${detail} At line ${location.line}, column ${location.column}. Snippet: ${snippet}`
  );
}

function createDiagnostic(
  level: "error" | "warning",
  code: string,
  message: string,
  template: string,
  index: number
): TemplateDiagnostic {
  const location = toLineColumn(template, index);
  return {
    level,
    code,
    message,
    line: location.line,
    column: location.column,
    snippet: template.slice(Math.max(0, index - 24), Math.min(template.length, index + 48)),
  };
}

function toLineColumn(template: string, index: number): { line: number; column: number } {
  const safeIndex = Math.max(0, Math.min(index, template.length));
  const before = template.slice(0, safeIndex);
  const lines = before.split("\n");

  return {
    line: lines.length,
    column: (lines[lines.length - 1]?.length ?? 0) + 1,
  };
}

export function createComponentInstance(
  ComponentClass: any,
  state?: Record<string, unknown>
): Record<string, any> {
  const instance = new ComponentClass();

  const i18n = container.has(I18nService)
    ? container.resolve<I18nService>(I18nService)
    : new I18nService();
  const mcp = Object.create(null) as Record<string, unknown>;

  if (!Object.prototype.hasOwnProperty.call(instance, "$i18n")) {
    Object.defineProperty(instance, "$i18n", {
      value: i18n,
      enumerable: false,
      configurable: false,
      writable: false,
    });

    Object.defineProperty(instance, "t", {
      value: (key: string) => (i18n as I18nService).t(key),
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }

  if (!Object.prototype.hasOwnProperty.call(instance, "$mcp")) {
    Object.defineProperty(instance, "$mcp", {
      value: mcp,
      enumerable: false,
      configurable: false,
      writable: false,
    });
  }

  if (state) {
    applyState(instance, state);
  }
  return instance;
}

export function renderComponent(
  ComponentClass: any,
  options?: { state?: Record<string, unknown> }
): string {
  const metadata = getComponentMetadata(ComponentClass);
  if (!metadata) {
    throw new Error("Component metadata not found. Did you use @Component?");
  }

  const instance = createComponentInstance(ComponentClass, options?.state);
  return renderTemplate(metadata.template, instance);
}

export function renderComponentSSR(
  ComponentClass: any,
  options?: { islandId?: string; state?: Record<string, unknown> }
): SSRRenderResult {
  const metadata = getComponentMetadata(ComponentClass);
  if (!metadata) {
    throw new Error("Component metadata not found. Did you use @Component?");
  }

  const instance = createComponentInstance(ComponentClass, options?.state);
  const componentHtml = renderTemplate(metadata.template, instance);
  const state = extractState(instance);
  const hydrate = metadata.hydrate ?? "island";
  const componentKey = ComponentClass.name;
  const islandId = options?.islandId ?? `${componentKey}-root`;

  const html =
    hydrate === "none"
      ? componentHtml
      : `<div data-nx-island="${componentKey}" data-nx-island-id="${islandId}">${componentHtml}</div>`;

  return { html, state, hydrate, componentKey, islandId };
}
