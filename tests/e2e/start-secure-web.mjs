// Serve the production Next build over local TLS for Secure-cookie E2E tests.
// The certificate and key are generated per run outside the repository.
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:https";
import { request as httpRequest } from "node:http";
import { connect } from "node:net";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const temp = mkdtempSync(join(tmpdir(), "anatole-e2e-tls-"));
const key = join(temp, "key.pem");
const cert = join(temp, "cert.pem");
const openssl = process.env.OPENSSL_BIN ||
  (process.platform === "win32" ? "C:\\Program Files\\Git\\usr\\bin\\openssl.exe" : "openssl");
const generated = spawnSync(openssl, [
  "req", "-x509", "-newkey", "rsa:2048", "-nodes",
  "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=localhost",
  "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1",
], { stdio: "ignore" });
if (generated.status !== 0) {
  rmSync(temp, { recursive: true, force: true });
  throw new Error("Could not create the temporary E2E TLS certificate");
}

const next = resolve("node_modules", "next", "dist", "bin", "next");
const build = spawnSync(process.execPath, [next, "build"], { stdio: "inherit", env: process.env });
if (build.status !== 0) {
  rmSync(temp, { recursive: true, force: true });
  process.exit(build.status ?? 1);
}

const app = spawn(process.execPath, [next, "start", "--hostname", "127.0.0.1", "--port", "3001"], {
  stdio: "inherit", env: process.env,
});
let stopped = false;
function stop() {
  if (stopped) return;
  stopped = true;
  app.kill();
  server.close();
  rmSync(temp, { recursive: true, force: true });
}

const server = createServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
  const upstream = httpRequest({
    hostname: "127.0.0.1", port: 3001, method: req.method, path: req.url,
    headers: { ...req.headers, "x-forwarded-proto": "https" },
  }, (response) => {
    res.writeHead(response.statusCode ?? 502, response.headers);
    response.pipe(res);
  });
  upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
  req.pipe(upstream);
});

server.on("upgrade", (req, socket, head) => {
  if (!req.url?.startsWith("/ws/v1/")) { socket.destroy(); return; }
  const upstream = connect(8000, "127.0.0.1", () => {
    const headers = Object.entries(req.headers)
      .map(([name, value]) => `${name}: ${Array.isArray(value) ? value.join(", ") : value}`)
      .join("\r\n");
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

app.on("exit", (code) => { stop(); process.exitCode = code ?? 1; });
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.on("exit", () => rmSync(temp, { recursive: true, force: true }));
server.listen(3000, "localhost");
