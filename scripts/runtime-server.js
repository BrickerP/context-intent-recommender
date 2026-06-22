#!/usr/bin/env node
import http from "node:http";
import { buildAgentHandoff, routeContext } from "../src/runtime/router.js";

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "127.0.0.1";
let latestSnapshot = null;

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || `${host}:${port}`}`);

    if (request.method === "OPTIONS") {
      sendJson(response, 204, null);
      return;
    }

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true, service: "context-runtime" });
      return;
    }

    if (request.method === "POST" && url.pathname === "/context") {
      const context = await readJsonBody(request);
      latestSnapshot = {
        context,
        receivedAt: new Date().toISOString(),
        source: context?.sourceMeta?.source || "unknown"
      };
      sendJson(response, 200, routeContext(context));
      return;
    }

    if (request.method === "GET" && url.pathname === "/context") {
      if (!latestSnapshot) return sendMissingContext(response);
      sendJson(response, 200, latestSnapshot);
      return;
    }

    if (request.method === "GET" && url.pathname === "/show") {
      if (!latestSnapshot) return sendMissingContext(response);
      const recommendation = routeContext(latestSnapshot.context);
      sendJson(response, 200, {
        ...latestSnapshot,
        recommendation
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/recommend") {
      if (!latestSnapshot) return sendMissingContext(response);
      sendJson(response, 200, routeContext(latestSnapshot.context));
      return;
    }

    if (request.method === "POST" && url.pathname === "/recommend") {
      const context = await readJsonBody(request);
      latestSnapshot = {
        context,
        receivedAt: new Date().toISOString(),
        source: context?.sourceMeta?.source || "unknown"
      };
      sendJson(response, 200, routeContext(context));
      return;
    }

    if (request.method === "GET" && url.pathname === "/agent") {
      if (!latestSnapshot) return sendMissingContext(response);
      const recommendation = routeContext(latestSnapshot.context);
      sendJson(response, 200, {
        ...latestSnapshot,
        recommendation,
        handoff: buildAgentHandoff({
          actionId: url.searchParams.get("actionId") || undefined,
          context: latestSnapshot.context,
          recommendation
        })
      });
      return;
    }

    {
      sendJson(response, 404, {
        error: "not_found",
        message: "Use POST /context, GET /show, GET /recommend, or GET /agent?actionId=..."
      });
      return;
    }
  } catch (error) {
    sendJson(response, 400, {
      error: "bad_request",
      message: error instanceof Error ? error.message : String(error)
    });
  }
});

server.on("error", async (error) => {
  if (error?.code === "EADDRINUSE") {
    const existing = await checkExistingRuntime();
    if (existing) {
      console.error(`context-runtime already running on http://${host}:${port}`);
      console.error("Use `frontend show` after refreshing the Chrome extension.");
      process.exit(0);
    }

    console.error(`Port ${host}:${port} is already in use by another process.`);
    console.error("Set PORT=<other-port> or stop the process using that port.");
    process.exit(1);
  }

  throw error;
});

server.listen(port, host, () => {
  console.error(`context-runtime listening on http://${host}:${port}`);
  console.error("POST extension ContextSnapshot JSON to /context");
});

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  response.end(payload === null ? "" : `${JSON.stringify(payload, null, 2)}\n`);
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody(request) {
  const body = await readBody(request);
  return JSON.parse(body || "{}");
}

function sendMissingContext(response) {
  sendJson(response, 404, {
    error: "no_context",
    message: "No extension context has been captured yet. Open a page and click the Chrome extension refresh button."
  });
}

async function checkExistingRuntime() {
  try {
    const response = await fetch(`http://${host}:${port}/health`);
    if (!response.ok) return false;
    const payload = await response.json();
    return payload?.service === "context-runtime";
  } catch {
    return false;
  }
}
