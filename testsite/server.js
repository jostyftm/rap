import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8088;

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".png": "image/png",
};

const server = http.createServer((req, res) => {
  const urlPath = req.url === "/" ? "/index.html" : (req.url?.split("?")[0] || "/index.html");
  const filePath = path.join(__dirname, urlPath);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("404 Not Found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "text/plain" });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`[TestSite] Servidor corriendo en http://localhost:${PORT}`);
});
