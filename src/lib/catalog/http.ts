import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { CatalogError } from "./types.ts";
import type { CatalogService } from "./service.ts";
import { findAlternatives } from "../alternatives/index.ts";
import { record } from "./normalize.ts";

function send(response: ServerResponse, status: number, payload: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (request.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new CatalogError("INPUT", "Нужен Content-Type: application/json.");
  }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const bytes = Buffer.from(chunk);
    length += bytes.length;
    if (length > 16384) throw new CatalogError("INPUT", "Слишком большой запрос.");
    chunks.push(bytes);
  }
  try { return record(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
  catch { throw new CatalogError("INPUT", "Некорректный JSON."); }
}

// Read-only, loopback service for Python/Node integration. Do not expose publicly.
export function createCatalogHttpServer(catalog: CatalogService) {
  return createServer({ requestTimeout: 15000, headersTimeout: 10000 }, async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/health") {
        const index = catalog.getIndex();
        send(response, 200, { status: "ok", source: index.source, indexed: index.items.length,
          complete: index.complete, indexedAt: index.indexedAt });
        return;
      }
      if (request.method === "GET" && url.pathname === "/products/search") {
        send(response, 200, catalog.searchProducts(url.searchParams.get("q") ?? "", Number(url.searchParams.get("limit") ?? 10)));
        return;
      }
      const productPath = url.pathname.match(/^\/products\/([^/]+)$/);
      if (request.method === "GET" && productPath) {
        send(response, 200, await catalog.getProduct(decodeURIComponent(productPath[1])));
        return;
      }
      if (request.method === "POST" && url.pathname === "/alternatives") {
        const body = await readJson(request);
        if (typeof body.productId !== "string" || typeof body.category !== "string" ||
            !Array.isArray(body.requiredProperties) || !body.requiredProperties.every(key => typeof key === "string") ||
            ["quantity", "maxCandidates", "limit"].some(key => body[key] !== undefined && typeof body[key] !== "number")) {
          throw new CatalogError("INPUT", "Нужны productId, category, requiredProperties и числовые лимиты.");
        }
        send(response, 200, await findAlternatives(catalog, body.productId, {
          category: body.category, requiredProperties: body.requiredProperties,
          quantity: body.quantity as number | undefined,
          maxCandidates: body.maxCandidates as number | undefined,
          limit: body.limit as number | undefined,
          candidateIds: body.candidateIds as string[] | undefined,
        }));
        return;
      }
      send(response, 404, { error: { code: "NOT_FOUND", message: "Маршрут не найден." } });
    } catch (error) {
      const code = error instanceof CatalogError ? error.code : error instanceof URIError ? "INPUT" : "INTERNAL";
      const status = code === "INPUT" ? 400 : code === "NOT_FOUND" ? 404 : code === "TIMEOUT" ? 504 :
        ["UPSTREAM", "AUTH", "INVALID_DATA"].includes(code) ? 502 : code === "INDEX_NOT_READY" ? 503 : 500;
      send(response, status, { error: { code,
        message: error instanceof CatalogError ? error.message : "Не удалось обработать запрос." } });
    }
  });
}
