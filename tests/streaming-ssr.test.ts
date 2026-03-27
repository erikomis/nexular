import { describe, it, expect, beforeEach } from "vitest";
import {
  StreamingSSRRenderer,
  ProgressiveRenderingPipeline,
  createProgressiveRenderer,
} from "../src/server/streaming-ssr";

describe("Streaming SSR Renderer", () => {
  let renderer: StreamingSSRRenderer;

  beforeEach(() => {
    renderer = new StreamingSSRRenderer();
  });

  it("should render shell HTML", () => {
    const shellHtml = `<html><body></body></html>`;
    renderer.addShell(shellHtml);

    const output = renderer.render();
    expect(output).toContain(shellHtml);
  });

  it("should reject shell rendering twice", () => {
    renderer.addShell("<html></html>");
    expect(() => renderer.addShell("<html></html>")).toThrow();
  });

  it("should require shell before adding partials", () => {
    expect(() => renderer.addPartial("partial", "<div>test</div>")).toThrow();
  });

  it("should add partial content chunks", () => {
    renderer.addShell("<html><body></body></html>");
    renderer.addPartial("header", "<header>Header</header>", "high");
    renderer.addPartial("content", "<main>Content</main>", "normal");

    const output = renderer.render();
    expect(output).toContain("Header");
    expect(output).toContain("Content");
  });

  it("should add data chunks with JSON", () => {
    renderer.addShell("<html></html>");
    renderer.addData("state", { userId: "123", name: "John" });

    const output = renderer.render();
    expect(output).toContain("__NEXULAR_STATE__");
    expect(output).toContain("userId");
    expect(output).toContain("123");
  });

  it("should add inline scripts", () => {
    renderer.addShell("<html></html>");
    renderer.addScript("console.log('Hello');");

    const output = renderer.render();
    expect(output).toContain("console.log('Hello');");
  });

  it("should render complete event", () => {
    renderer.addShell("<html></html>");
    renderer.complete();

    const output = renderer.render();
    expect(output).toContain("nexular:hydrated");
  });

  it("should create readable stream", async () => {
    renderer.addShell("<html><body>Content</body></html>");
    renderer.addData("state", { test: true });
    renderer.complete();

    const stream = renderer.createStream();
    let content = "";

    for await (const chunk of stream) {
      content += chunk.toString();
    }

    expect(content).toContain("Content");
    expect(content).toContain("__NEXULAR_STATE__");
  });

  it("should sort chunks by priority", () => {
    renderer.addShell("<html></html>");
    renderer.addPartial("low", "Low", "low");
    renderer.addPartial("high", "High", "high");
    renderer.addPartial("normal", "Normal", "normal");

    const output = renderer.render();

    // High priority should appear first after shell
    const highIndex = output.indexOf("High");
    const normalIndex = output.indexOf("Normal");
    const lowIndex = output.indexOf("Low");

    expect(highIndex < normalIndex).toBe(true);
    expect(normalIndex < lowIndex).toBe(true);
  });
});

describe("Progressive Rendering Pipeline", () => {
  let pipeline: ProgressiveRenderingPipeline;

  beforeEach(() => {
    pipeline = createProgressiveRenderer();
  });

  it("should execute render stages", async () => {
    pipeline
      .addStage("layout", () => "<html><body></body></html>", "critical")
      .addStage("header", () => "<header>Header</header>", "high")
      .addStage("content", () => "<main>Content</main>", "normal")
      .addStage("footer", () => "<footer>Footer</footer>", "low");

    const renderer = await pipeline.execute();
    const output = renderer.render();

    expect(output).toContain("Header");
    expect(output).toContain("Content");
    expect(output).toContain("Footer");
  });

  it("should handle async render stages", async () => {
    pipeline
      .addStage("shell", () => "<html></html>", "critical")
      .addStage("async-data", async () => {
        return new Promise((resolve) => setTimeout(() => resolve("<div>Async Data</div>"), 10));
      });

    const renderer = await pipeline.execute();
    const output = renderer.render();

    expect(output).toContain("Async Data");
  });

  it("should handle stage errors gracefully", async () => {
    pipeline
      .addStage("shell", () => "<html></html>", "critical")
      .addStage(
        "error-stage",
        () => {
          throw new Error("Stage failed");
        },
        "normal"
      );

    const renderer = await pipeline.execute();
    const output = renderer.render();

    expect(output).toContain("Error");
  });

  it("should execute streaming generator", async () => {
    pipeline
      .addStage("level1", () => "Level 1", "high")
      .addStage("level2", () => "Level 2", "normal")
      .addStage("level3", () => "Level 3", "low");

    const chunks: string[] = [];

    for await (const chunk of pipeline.executeStreaming()) {
      if (chunk.content) {
        chunks.push(chunk.content);
      }
    }

    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.some((c) => c.includes("Level 1"))).toBe(true);
  });

  it("should prioritize critical stages first", async () => {
    const executionOrder: string[] = [];

    pipeline
      .addStage(
        "critical",
        () => {
          executionOrder.push("critical");
          return "Critical";
        },
        "critical"
      )
      .addStage(
        "high",
        () => {
          executionOrder.push("high");
          return "High";
        },
        "high"
      )
      .addStage(
        "normal",
        () => {
          executionOrder.push("normal");
          return "Normal";
        },
        "normal"
      );

    await pipeline.execute();

    expect(executionOrder[0]).toBe("critical");
    expect(executionOrder[1]).toBe("high");
    expect(executionOrder[2]).toBe("normal");
  });

  it("should create multiple renderers without interference", async () => {
    const pipeline1 = createProgressiveRenderer().addStage("s1", () => "P1", "critical");
    const pipeline2 = createProgressiveRenderer().addStage("s2", () => "P2", "critical");

    const renderer1 = await pipeline1.execute();
    const renderer2 = await pipeline2.execute();

    const output1 = renderer1.render();
    const output2 = renderer2.render();

    expect(output1).toContain("P1");
    expect(output2).toContain("P2");
    expect(output1).not.toContain("P2");
  });
});
