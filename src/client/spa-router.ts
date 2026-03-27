import { hydrateIslands } from "../app/core/hydration";

type NavigationMode = "push" | "replace" | "pop";

type ClientRouterOptions = {
  hydrateRegistry: Record<string, any>;
};

type ParsedHydrationPayload = {
  locale?: string;
  islands: Array<{
    selector: string;
    component: string;
    template?: string;
    state: Record<string, unknown>;
  }>;
};

declare global {
  interface Window {
    __NEXULAR_HYDRATION__?: ParsedHydrationPayload;
    __NEXULAR_STATE__?: unknown;
  }
}

const TRANSITION_STYLE_ID = "nx-spa-transition-style";
const TRANSITIONING_CLASS = "nx-spa-transitioning";
const ENTER_CLASS = "nx-spa-enter";
const LEAVE_CLASS = "nx-spa-leave";

function ensureTransitionStyles(): void {
  if (document.getElementById(TRANSITION_STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = TRANSITION_STYLE_ID;
  style.textContent = [
    ":root {",
    "  --nx-page-enter-ms: 340ms;",
    "  --nx-page-leave-ms: 190ms;",
    "  --nx-page-ease: cubic-bezier(0.2, 0.8, 0.2, 1);",
    "}",
    "app-root {",
    "  display: block;",
    "  min-height: 100dvh;",
    "}",
    "app-root.nx-spa-leave {",
    "  animation: nxPageLeave var(--nx-page-leave-ms) ease-in forwards;",
    "}",
    "app-root.nx-spa-enter {",
    "  animation: nxPageEnter var(--nx-page-enter-ms) var(--nx-page-ease) both;",
    "}",
    "app-root.nx-spa-enter [data-nx-layout='root'] > * {",
    "  opacity: 0;",
    "  transform: translateY(10px);",
    "  animation: nxStaggerIn 380ms var(--nx-page-ease) both;",
    "}",
    "app-root.nx-spa-enter [data-nx-layout='root'] > *:nth-child(1) { animation-delay: 30ms; }",
    "app-root.nx-spa-enter [data-nx-layout='root'] > *:nth-child(2) { animation-delay: 70ms; }",
    "app-root.nx-spa-enter [data-nx-layout='root'] > *:nth-child(3) { animation-delay: 110ms; }",
    "app-root.nx-spa-enter [data-nx-layout='root'] > *:nth-child(4) { animation-delay: 150ms; }",
    "body.nx-spa-transitioning {",
    "  cursor: progress;",
    "}",
    "@keyframes nxPageLeave {",
    "  0% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0px); }",
    "  100% { opacity: 0; transform: translateY(6px) scale(0.995); filter: blur(1px); }",
    "}",
    "@keyframes nxPageEnter {",
    "  0% { opacity: 0; transform: translateY(14px) scale(0.996); filter: blur(2px); }",
    "  100% { opacity: 1; transform: translateY(0) scale(1); filter: blur(0px); }",
    "}",
    "@keyframes nxStaggerIn {",
    "  0% { opacity: 0; transform: translateY(10px); }",
    "  100% { opacity: 1; transform: translateY(0); }",
    "}",
  ].join("\n");

  document.head.appendChild(style);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getAppRoot(): HTMLElement | null {
  return document.querySelector("app-root");
}

function isLocalNavigableAnchor(anchor: HTMLAnchorElement): boolean {
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) {
    return false;
  }

  if (anchor.target && anchor.target !== "_self") {
    return false;
  }

  if (anchor.hasAttribute("download")) {
    return false;
  }

  if (anchor.getAttribute("rel") === "external") {
    return false;
  }

  const url = new URL(anchor.href, globalThis.location.origin);
  return url.origin === globalThis.location.origin;
}

function parseHydrationPayloadFromDocument(doc: Document): ParsedHydrationPayload | undefined {
  const scripts = Array.from(doc.querySelectorAll("script"));

  for (const script of scripts) {
    const scriptText = script.textContent ?? "";
    const marker = "window.__NEXULAR_HYDRATION__=";
    const start = scriptText.indexOf(marker);
    if (start === -1) {
      continue;
    }

    const jsonStart = start + marker.length;
    const trailing = scriptText.slice(jsonStart).trim();
    const normalized = trailing.endsWith(";") ? trailing.slice(0, -1) : trailing;

    try {
      return JSON.parse(normalized) as ParsedHydrationPayload;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function parseSharedStateFromDocument(doc: Document): unknown {
  const scripts = Array.from(doc.querySelectorAll("script"));

  for (const script of scripts) {
    const scriptText = script.textContent ?? "";
    const marker = "window.__NEXULAR_STATE__=";
    const start = scriptText.indexOf(marker);
    if (start === -1) {
      continue;
    }

    const jsonStart = start + marker.length;
    const trailing = scriptText.slice(jsonStart).trim();
    const normalized = trailing.endsWith(";") ? trailing.slice(0, -1) : trailing;

    try {
      return JSON.parse(normalized);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function updateDocumentHeadFromResponse(doc: Document): void {
  if (doc.title) {
    document.title = doc.title;
  }
}

function executeInlineScripts(scope: ParentNode): void {
  const scripts = Array.from(scope.querySelectorAll("script"));

  scripts.forEach((oldScript) => {
    const freshScript = document.createElement("script");

    for (const attr of Array.from(oldScript.attributes)) {
      freshScript.setAttribute(attr.name, attr.value);
    }

    if (oldScript.textContent) {
      freshScript.textContent = oldScript.textContent;
    }

    oldScript.replaceWith(freshScript);
  });
}

function updateActiveNav(currentPath: string): void {
  const navLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>("nav a[href]"));

  navLinks.forEach((link) => {
    const href = link.getAttribute("href") ?? "/";
    const normalized = href === "/" ? "/" : href.replace(/\/$/, "");
    const active =
      normalized === "/"
        ? currentPath === "/"
        : currentPath === normalized || currentPath.startsWith(`${normalized}/`);

    link.classList.toggle("active", active);
  });
}

async function fetchRouteDocument(url: URL): Promise<Document> {
  const response = await fetch(url.toString(), {
    headers: {
      "X-Nexular-Navigate": "1",
      Accept: "text/html",
    },
  });

  if (!response.ok) {
    throw new Error(`Navigation failed with status ${response.status}`);
  }

  const html = await response.text();
  const parser = new DOMParser();
  return parser.parseFromString(html, "text/html");
}

async function animateOut(root: HTMLElement): Promise<void> {
  root.classList.remove(ENTER_CLASS);
  root.classList.add(LEAVE_CLASS);
  await wait(190);
}

async function animateIn(root: HTMLElement): Promise<void> {
  root.classList.remove(LEAVE_CLASS);
  root.classList.add(ENTER_CLASS);
  await wait(360);
  root.classList.remove(ENTER_CLASS);
}

function updateHistory(targetUrl: URL, mode: NavigationMode): void {
  const target = `${targetUrl.pathname}${targetUrl.search}`;

  if (mode === "push") {
    history.pushState({ path: target }, "", targetUrl.toString());
  }

  if (mode === "replace") {
    history.replaceState({ path: target }, "", targetUrl.toString());
  }
}

async function applyFetchedDocument(params: {
  root: HTMLElement;
  targetUrl: URL;
  mode: NavigationMode;
  doc: Document;
  hydrateRegistry: Record<string, any>;
}): Promise<void> {
  const { root, targetUrl, mode, doc, hydrateRegistry } = params;
  const nextRoot = doc.querySelector("app-root");

  if (!nextRoot) {
    globalThis.location.href = targetUrl.toString();
    return;
  }

  updateHistory(targetUrl, mode);
  updateDocumentHeadFromResponse(doc);

  const hydrationPayload = parseHydrationPayloadFromDocument(doc);
  const sharedState = parseSharedStateFromDocument(doc);

  root.innerHTML = nextRoot.innerHTML;
  executeInlineScripts(root);

  if (sharedState !== undefined) {
    globalThis.window.__NEXULAR_STATE__ = sharedState;
  }

  if (hydrationPayload) {
    globalThis.window.__NEXULAR_HYDRATION__ = hydrationPayload;
    hydrateIslands(hydrateRegistry);
  }

  updateActiveNav(targetUrl.pathname || "/");

  if (targetUrl.hash) {
    const hashTarget = document.getElementById(targetUrl.hash.slice(1));
    if (hashTarget) {
      hashTarget.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return;
  }

  globalThis.scrollTo({ top: 0, behavior: "smooth" });
}

export function setupClientRouter(options: ClientRouterOptions): void {
  if (globalThis.window === undefined || globalThis.document === undefined) {
    return;
  }

  ensureTransitionStyles();
  let navigating = false;

  const navigate = async (targetUrl: URL, mode: NavigationMode): Promise<void> => {
    if (navigating) {
      return;
    }

    const currentUrl = new URL(globalThis.location.href);
    if (targetUrl.pathname === currentUrl.pathname && targetUrl.search === currentUrl.search) {
      if (targetUrl.hash) {
        globalThis.location.hash = targetUrl.hash;
      }
      return;
    }

    const root = getAppRoot();
    if (!root) {
      globalThis.location.href = targetUrl.toString();
      return;
    }

    navigating = true;
    document.body.classList.add(TRANSITIONING_CLASS);

    try {
      await animateOut(root);

      const doc = await fetchRouteDocument(targetUrl);
      await applyFetchedDocument({
        root,
        targetUrl,
        mode,
        doc,
        hydrateRegistry: options.hydrateRegistry,
      });

      await animateIn(root);
      globalThis.dispatchEvent(
        new CustomEvent("nexular:navigated", { detail: { path: targetUrl.pathname } })
      );
    } catch {
      globalThis.location.href = targetUrl.toString();
    } finally {
      navigating = false;
      document.body.classList.remove(TRANSITIONING_CLASS);
    }
  };

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented) {
      return;
    }

    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const target = event.target as Element | null;
    const anchor = target?.closest<HTMLAnchorElement>("a[href]");

    if (!anchor || !isLocalNavigableAnchor(anchor)) {
      return;
    }

    const url = new URL(anchor.href, globalThis.location.origin);
    event.preventDefault();
    void navigate(url, "push");
  });

  globalThis.addEventListener("popstate", () => {
    const url = new URL(globalThis.location.href);
    void navigate(url, "pop");
  });

  // Optional warm-up for likely next routes.
  const prefetched = new Set<string>();
  document.addEventListener(
    "mouseover",
    (event) => {
      const target = event.target as Element | null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || !isLocalNavigableAnchor(anchor)) {
        return;
      }

      const url = new URL(anchor.href, globalThis.location.origin);
      const key = `${url.pathname}${url.search}`;
      if (prefetched.has(key)) {
        return;
      }

      prefetched.add(key);
      void fetch(url.toString(), {
        headers: {
          "X-Nexular-Prefetch": "1",
          Accept: "text/html",
        },
      }).catch(() => {
        prefetched.delete(key);
      });
    },
    { passive: true }
  );

  updateActiveNav(globalThis.location.pathname || "/");
}
