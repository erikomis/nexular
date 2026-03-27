/**
 * Streaming SSR Renderer
 * Incremental rendering with progressive HTML streaming
 */

import { Readable, Transform } from "node:stream";

export type StreamingChunk = {
  type: "shell" | "partial" | "data" | "script" | "complete";
  id?: string;
  content: string;
  priority?: "high" | "normal" | "low";
};

export class StreamingSSRRenderer {
  private chunks: StreamingChunk[] = [];
  private shellRendered = false;

  /**
   * Add shell chunk (initial HTML skeleton)
   */
  addShell(html: string): void {
    if (this.shellRendered) {
      throw new Error("Shell already rendered");
    }

    this.chunks.push({
      type: "shell",
      content: html,
      priority: "high",
    });

    this.shellRendered = true;
  }

  /**
   * Add partial content chunk (for streaming sections)
   */
  addPartial(id: string, content: string, priority: "high" | "normal" | "low" = "normal"): void {
    if (!this.shellRendered) {
      throw new Error("Shell must be rendered first");
    }

    this.chunks.push({
      type: "partial",
      id,
      content,
      priority,
    });
  }

  /**
   * Add data chunk (state that will be injected into script tags)
   */
  addData(id: string, data: Record<string, any>): void {
    this.chunks.push({
      type: "data",
      id,
      content: JSON.stringify(data),
      priority: "normal",
    });
  }

  /**
   * Add inline script chunk
   */
  addScript(content: string, priority: "high" | "normal" | "low" = "normal"): void {
    this.chunks.push({
      type: "script",
      content,
      priority,
    });
  }

  /**
   * Mark rendering as complete
   */
  complete(): void {
    this.chunks.push({
      type: "complete",
      content: "",
      priority: "high",
    });
  }

  /**
   * Create a Node.js readable stream for HTTP streaming
   */
  createStream(): Readable {
    let index = 0;
    const chunks = this.getSortedChunks();

    return new Readable({
      async read() {
        if (index >= chunks.length) {
          this.push(null);
          return;
        }

        const chunk = chunks[index];
        index++;

        switch (chunk.type) {
          case "shell":
            this.push(chunk.content);
            break;

          case "partial":
            // Inject with script-based DOM manipulation
            this.push(`<script>
document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('${chunk.id}');
  if (el) el.innerHTML = ${JSON.stringify(chunk.content)};
});
</script>\nPartial content for ${chunk.id}\n`);
            break;

          case "data":
            // Inject state into window object
            this.push(`<script>
window.__NEXULAR_STATE__ = window.__NEXULAR_STATE__ || {};
window.__NEXULAR_STATE__['${chunk.id}'] = ${chunk.content};
</script>\n`);
            break;

          case "script":
            this.push(`<script>${chunk.content}</script>\n`);
            break;

          case "complete":
            this.push(`<script>
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.dispatchEvent(new Event('nexular:hydrated'));
  });
} else {
  window.dispatchEvent(new Event('nexular:hydrated'));
}
</script>\n`);
            break;
        }
      },
    });
  }

  /**
   * Get chunks sorted by priority
   */
  private getSortedChunks(): StreamingChunk[] {
    const priorityMap = { high: 0, normal: 1, low: 2 };
    return [...this.chunks].sort((a, b) => {
      const priorityA = priorityMap[a.priority || "normal"];
      const priorityB = priorityMap[b.priority || "normal"];
      return priorityA - priorityB;
    });
  }

  /**
   * Get all chunks as string (for non-streaming scenarios)
   */
  render(): string {
    return this.getSortedChunks()
      .map((chunk) => {
        switch (chunk.type) {
          case "shell":
            return chunk.content;

          case "partial":
            return `<template id="partial-${chunk.id}">${chunk.content}</template>`;

          case "data":
            return `<script>
window.__NEXULAR_STATE__ = window.__NEXULAR_STATE__ || {};
window.__NEXULAR_STATE__['${chunk.id}'] = ${chunk.content};
</script>`;

          case "script":
            return `<script>${chunk.content}</script>`;

          case "complete":
            return `<script>
window.dispatchEvent(new Event('nexular:hydrated'));
</script>`;

          default:
            return "";
        }
      })
      .join("\n");
  }
}

/**
 * Progressive rendering pipeline
 * Breaks rendering into stages for better performance
 */
export class ProgressiveRenderingPipeline {
  private stages: Array<{
    name: string;
    fn: () => Promise<string> | string;
    priority: "critical" | "high" | "normal" | "low";
  }> = [];

  addStage(
    name: string,
    fn: () => Promise<string> | string,
    priority: "critical" | "high" | "normal" | "low" = "normal"
  ): this {
    this.stages.push({ name, fn, priority });
    return this;
  }

  /**
   * Execute pipeline and return streaming renderer
   */
  async execute(): Promise<StreamingSSRRenderer> {
    const renderer = new StreamingSSRRenderer();

    // Sort by priority
    const priorityMap = { critical: 0, high: 1, normal: 2, low: 3 };
    const sorted = [...this.stages].sort(
      (a, b) => priorityMap[a.priority] - priorityMap[b.priority]
    );

    for (const stage of sorted) {
      try {
        const content = await Promise.resolve(stage.fn());

        if (stage.priority === "critical" && !renderer["shellRendered"]) {
          renderer.addShell(content);
        } else {
          renderer.addPartial(`stage-${stage.name}`, content);
        }
      } catch (error) {
        console.error(`Error in render stage "${stage.name}":`, error);
        renderer.addPartial(`stage-${stage.name}-error`, `<p>Error rendering ${stage.name}</p>`);
      }
    }

    renderer.complete();
    return renderer;
  }

  /**
   * Execute pipeline streaming to client
   */
  async *executeStreaming(): AsyncGenerator<StreamingChunk, void> {
    const priorityMap = { critical: 0, high: 1, normal: 2, low: 3 };
    const sorted = [...this.stages].sort(
      (a, b) => priorityMap[a.priority] - priorityMap[b.priority]
    );

    let shellYielded = false;

    for (const stage of sorted) {
      try {
        const content = await Promise.resolve(stage.fn());

        if (stage.priority === "critical" && !shellYielded) {
          yield {
            type: "shell",
            content,
            priority: "high",
          };
          shellYielded = true;
        } else {
          const chunkPriority = stage.priority === "critical" ? "high" : stage.priority;
          yield {
            type: "partial",
            id: `stage-${stage.name}`,
            content,
            priority: chunkPriority,
          };
        }
      } catch (error) {
        console.error(`Error in render stage "${stage.name}":`, error);
        yield {
          type: "partial",
          id: `stage-${stage.name}-error`,
          content: `<p>Error rendering ${stage.name}</p>`,
          priority: "low",
        };
      }
    }

    yield {
      type: "complete",
      content: "",
      priority: "high",
    };
  }
}

/**
 * Create a progressive rendering builder
 */
export function createProgressiveRenderer(): ProgressiveRenderingPipeline {
  return new ProgressiveRenderingPipeline();
}
