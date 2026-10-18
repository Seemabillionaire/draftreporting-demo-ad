import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import login from "../api/login.js";
import logout from "../api/logout.js";
import session from "../api/session.js";
import library from "../api/library.js";
import { getConfig, PASSCODE_ENV, SECRET_ENV, sendJson } from "../lib/auth.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const PORT = Number(process.env.PORT || 3100);
const STATIC = new Map([
  ["/", ["public/index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["public/index.html", "text/html; charset=utf-8"]],
  ["/login.html", ["public/login.html", "text/html; charset=utf-8"]],
  ["/login.js", ["public/login.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["public/styles.css", "text/css; charset=utf-8"]],
  ["/app.js", ["public/app.js", "text/javascript; charset=utf-8"]],
  ["/src/assemble.js", ["public/src/assemble.js", "text/javascript; charset=utf-8"]],
  ["/src/validate.js", ["public/src/validate.js", "text/javascript; charset=utf-8"]],
  ["/src/word.js", ["public/src/word.js", "text/javascript; charset=utf-8"]],
  [
    "/vendor/docx-9.8.1/index.mjs",
    ["public/vendor/docx-9.8.1/index.mjs", "text/javascript; charset=utf-8"]
  ]
]);
const API = new Map([
  ["/api/login", login],
  ["/api/logout", logout],
  ["/api/session", session],
  ["/api/library", library]
]);

function send(response, status, contentType, body) {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(body);
}

const config = getConfig();
if (!config.ok) {
  console.error("Cannot start: missing environment variable(s): " + config.missing.join(", "));
  console.error("Set " + PASSCODE_ENV + " and " + SECRET_ENV + ", then try again.");
  process.exit(1);
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    const apiHandler = API.get(url.pathname);
    if (apiHandler) {
      await apiHandler(request, response);
      return;
    }

    if (request.method !== "GET") {
      send(response, 405, "text/plain; charset=utf-8", "Method not allowed.");
      return;
    }

    const entry = STATIC.get(url.pathname);
    if (!entry) {
      send(response, 404, "text/plain; charset=utf-8", "Not found.");
      return;
    }

    const body = await fs.promises.readFile(path.join(ROOT, entry[0]));
    send(response, 200, entry[1], body);
  } catch (error) {
    if (error.code === "ENOENT") {
      send(response, 404, "text/plain; charset=utf-8", "Not found.");
      return;
    }
    console.error("Server error:", error.message);
    if (!response.headersSent) {
      sendJson(response, 500, { error: "Server error." });
    } else {
      response.end();
    }
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error("Port " + PORT + " is already in use. Set PORT to a free port and try again.");
  } else {
    console.error("Server could not start:", error.message);
  }
  process.exitCode = 1;
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("Report drafting demo: http://localhost:" + PORT);
});
