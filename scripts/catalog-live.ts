import { createCatalogService, createEktSource, CatalogError } from "../src/lib/catalog/index.ts";

try {
  const catalog = createCatalogService(createEktSource({
    username: process.env.EKT_API_USERNAME ?? "", password: process.env.EKT_API_PASSWORD ?? "",
  }));
  const requestedId = process.argv.find(argument => argument.startsWith("--id="))?.slice(5);
  if (requestedId) {
    console.log(JSON.stringify(await catalog.getProduct(requestedId), null, 2));
  } else {
  const index = await catalog.refreshIndex({ maxPages: 2 });
  const first = index.items[0];
  console.log(JSON.stringify({ pagesRead: index.pagesRead, count: index.items.length,
    complete: index.complete, stopReason: index.stopReason, source: index.source }, null, 2));
  if (first) {
    const product = await catalog.getProduct(first.id);
    console.log(JSON.stringify({ product, search: catalog.searchProducts(product.article) }, null, 2));
  }
  }
} catch (error) {
  console.error(error instanceof CatalogError ? `${error.code}: ${error.message}` : "Проверка не выполнена.");
  process.exitCode = 1;
}
