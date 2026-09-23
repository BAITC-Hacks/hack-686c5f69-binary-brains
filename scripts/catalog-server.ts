import { createCatalogService, createEktSource, CatalogError } from "../src/lib/catalog/index.ts";
import { createDemoSource } from "../src/lib/catalog/demo.ts";
import { createCatalogHttpServer } from "../src/lib/catalog/http.ts";

try {
  const demo = process.argv.includes("--demo");
  const port = Number(process.env.CATALOG_PORT ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new CatalogError("CONFIG", "Некорректный CATALOG_PORT.");
  const source = demo ? createDemoSource() : createEktSource({
    username: process.env.EKT_API_USERNAME ?? "", password: process.env.EKT_API_PASSWORD ?? "",
  });
  const catalog = createCatalogService(source);
  const index = await catalog.refreshIndex({ maxPages: Number(process.env.CATALOG_MAX_PAGES ?? (demo ? 3 : 2)) });
  const server = createCatalogHttpServer(catalog);
  server.on("error", () => { console.error("Не удалось запустить HTTP-сервис. Проверьте порт."); process.exitCode = 1; });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Каталог: http://127.0.0.1:${port}; источник=${source.mode}; товаров=${index.items.length}; полный=${index.complete}`);
  });
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => { server.close(); server.closeAllConnections(); });
  }
} catch (error) {
  console.error(error instanceof CatalogError ? `${error.code}: ${error.message}` : "Не удалось запустить каталог.");
  process.exitCode = 1;
}
