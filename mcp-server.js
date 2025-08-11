// MCP server exposing selected Web-Check API endpoints as tools
// Uses @modelcontextprotocol/sdk with stdio transport for compatibility with Claude Desktop and other STDIO hosts.
import { McpServer, StdioServerTransport } from "@modelcontextprotocol/sdk";
import { z } from "zod";
import fs from "fs";
import path from "path";

const API_DIR = path.join(process.cwd(), "api");

const loadHandlers = async () => {
  const files = fs
    .readdirSync(API_DIR)
    .filter((f) => f.endsWith(".js") && !f.startsWith("_"));
  const handlers = {};
  for (const file of files) {
    const name = file.replace(/\.js$/, "");
    try {
      const mod = await import(path.join(API_DIR, file));
      const handler = mod.default || mod.handler || mod;
      if (typeof handler === "function") {
        handlers[name] = handler;
      }
    } catch (err) {
      console.error(
        `[mcp-server] Failed to load handler ${file}: ${err.message}`
      );
    }
  }
  return handlers;
};

const createMcpServer = async () => {
  const server = new McpServer({ name: "web-check", version: "0.1.0-mcp" });
  const handlers = await loadHandlers();

  server.registerTool(
    "run_all_checks",
    {
      title: "Run All Checks",
      description:
        "Executes all Web-Check endpoints for the given URL and returns a JSON summary.",
      inputSchema: {
        url: z.string().describe("Target URL or domain to analyze"),
      },
    },
    async ({ url }) => {
      const results = {};
      for (const [name, handler] of Object.entries(handlers)) {
        try {
          const data = await invokeHandler(handler, url);
          results[name] = data;
        } catch (e) {
          results[name] = { error: e.message };
        }
      }
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    }
  );

  const curated = [
    "status",
    "headers",
    "ssl",
    "security-txt",
    "whois",
    "tech-stack",
  ];
  for (const name of curated) {
    if (!handlers[name]) continue;
    server.registerTool(
      name.replace(/-/g, "_"),
      {
        title: `Check: ${name}`,
        description: `Run the Web-Check ${name} endpoint for a URL`,
        inputSchema: {
          url: z.string().describe("Target URL or domain to analyze"),
        },
      },
      async ({ url }) => {
        const data = await invokeHandler(handlers[name], url);
        return {
          content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
        };
      }
    );
  }

  return server;
};

async function invokeHandler(handler, url) {
  return await new Promise((resolve, reject) => {
    const req = { query: { url } };
    const res = {
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        if (this.statusCode && this.statusCode >= 400) {
          reject(
            new Error(
              body?.error || `Request failed with status ${this.statusCode}`
            )
          );
        } else {
          resolve(body);
        }
      },
    };
    try {
      const maybePromise = handler(req, res);
      if (maybePromise && typeof maybePromise.then === "function") {
        maybePromise.catch(reject);
      }
    } catch (err) {
      reject(err);
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    const server = await createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  })().catch((e) => {
    console.error("[mcp-server] Fatal error starting MCP server:", e);
    process.exit(1);
  });
}

export default createMcpServer;
