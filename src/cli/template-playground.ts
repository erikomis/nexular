import express from "express";
import { analyzeTemplateDiagnostics, renderTemplateWithDiagnostics } from "../app/core/renderer";

export type TemplatePlaygroundServer = {
  close: () => Promise<void>;
};

export function startTemplatePlayground(options?: {
  host?: string;
  port?: number;
  logger?: (message: string) => void;
}): Promise<TemplatePlaygroundServer> {
  const host = options?.host ?? "127.0.0.1";
  const port = options?.port ?? 3340;
  const logger = options?.logger ?? (() => undefined);

  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ ok: true, service: "template-playground" });
  });

  app.post("/render", (req, res) => {
    const template = String(req.body?.template ?? "");
    const contextRaw = req.body?.context;
    const context =
      contextRaw && typeof contextRaw === "object" && !Array.isArray(contextRaw)
        ? (contextRaw as Record<string, unknown>)
        : {};

    try {
      const rendered = renderTemplateWithDiagnostics(template, context);
      res.status(200).json({
        ok: true,
        html: rendered.html,
        diagnostics: rendered.diagnostics,
      });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown template error",
        diagnostics: analyzeTemplateDiagnostics(template),
      });
    }
  });

  app.get("/", (_req, res) => {
    res.type("html").send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Nexular Template Playground</title>
    <style>
      :root {
        --bg: #0f172a;
        --panel: #111827;
        --panel2: #1f2937;
        --text: #e5e7eb;
        --muted: #9ca3af;
        --ok: #10b981;
        --warn: #f59e0b;
        --error: #ef4444;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        color: var(--text);
        background: radial-gradient(1200px 600px at 15% -10%, #1d4ed8 0%, transparent 50%),
                    radial-gradient(1000px 500px at 90% -20%, #0ea5e9 0%, transparent 45%),
                    var(--bg);
      }
      .wrap { padding: 20px; max-width: 1200px; margin: 0 auto; }
      h1 { margin: 0 0 14px; font-size: 20px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .panel { background: linear-gradient(160deg, var(--panel), var(--panel2)); border: 1px solid #334155; border-radius: 12px; padding: 12px; }
      label { display: block; margin-bottom: 6px; color: var(--muted); font-size: 12px; }
      textarea { width: 100%; min-height: 210px; border-radius: 8px; border: 1px solid #475569; background: #0b1220; color: var(--text); padding: 10px; resize: vertical; }
      button { margin-top: 10px; border: none; background: #0ea5e9; color: #041017; font-weight: 700; border-radius: 8px; padding: 10px 14px; cursor: pointer; }
      pre { margin: 0; white-space: pre-wrap; }
      .diag { margin-top: 8px; padding: 8px; border-radius: 8px; border: 1px solid #334155; }
      .diag.error { border-color: color-mix(in srgb, var(--error) 60%, #334155); }
      .diag.warning { border-color: color-mix(in srgb, var(--warn) 60%, #334155); }
      .muted { color: var(--muted); font-size: 12px; }
      @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>Nexular Template Playground</h1>
      <p class="muted">Teste templates modernos, visualize HTML gerado e diagnósticos em tempo real.</p>
      <div class="grid">
        <div class="panel">
          <label>Template</label>
          <textarea id="template">@if (isAdmin) {<p [class.active]="isAdmin">Admin {{ name | uppercase }}</p>} @else {<p>User</p>}</textarea>
          <label>Context (JSON)</label>
          <textarea id="context">{"isAdmin": true, "name": "erik"}</textarea>
          <button id="run">Render</button>
        </div>
        <div class="panel">
          <label>HTML Output</label>
          <pre id="html"></pre>
          <label style="margin-top:10px;">Diagnostics</label>
          <div id="diagnostics" class="muted">Sem diagnósticos.</div>
        </div>
      </div>
    </div>
    <script>
      const templateEl = document.getElementById('template');
      const contextEl = document.getElementById('context');
      const htmlEl = document.getElementById('html');
      const diagnosticsEl = document.getElementById('diagnostics');
      const runBtn = document.getElementById('run');

      const render = async () => {
        let context = {};
        try {
          context = JSON.parse(contextEl.value || '{}');
        } catch (error) {
          htmlEl.textContent = '';
          diagnosticsEl.innerHTML = '<div class="diag error">Context JSON inválido: ' + error.message + '</div>';
          return;
        }

        const res = await fetch('/render', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ template: templateEl.value || '', context }),
        });

        const payload = await res.json();

        if (!payload.ok) {
          htmlEl.textContent = '';
          diagnosticsEl.innerHTML = '<div class="diag error">' + payload.error + '</div>';
          return;
        }

        htmlEl.textContent = payload.html;

        if (!payload.diagnostics || payload.diagnostics.length === 0) {
          diagnosticsEl.innerHTML = '<div class="muted">Sem diagnósticos.</div>';
          return;
        }

        diagnosticsEl.innerHTML = payload.diagnostics.map((d) => {
          const pos = (d.line && d.column) ? ' (linha ' + d.line + ', coluna ' + d.column + ')' : '';
          return '<div class="diag ' + d.level + '"><strong>[' + d.level.toUpperCase() + '] ' + d.code + '</strong>' + pos + '<br/>' + d.message + '</div>';
        }).join('');
      };

      runBtn.addEventListener('click', render);
      render();
    </script>
  </body>
</html>`);
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, host, () => {
      logger(`Template playground running at http://${host}:${port}`);
      resolve({
        close: async () => {
          await new Promise<void>((done, fail) => {
            server.close((error) => (error ? fail(error) : done()));
          });
        },
      });
    });

    server.on("error", (error) => {
      reject(error);
    });
  });
}
