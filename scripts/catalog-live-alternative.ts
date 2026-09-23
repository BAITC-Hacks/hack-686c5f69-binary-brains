import { createCatalogService, createEktSource, CatalogError } from "../src/lib/catalog/index.ts";
import { findAlternatives } from "../src/lib/alternatives/index.ts";
import { indoorE27Profile } from "../src/lib/alternatives/profiles.ts";

try {
  const catalog = createCatalogService(createEktSource({
    username: process.env.EKT_API_USERNAME ?? "", password: process.env.EKT_API_PASSWORD ?? "",
  }));
  const started = performance.now();
  const original = await catalog.getProduct("18161");
  const result = await findAlternatives(catalog, original.id, {
    ...indoorE27Profile, candidateIds: ["23181"], quantity: 1,
  });
  console.log(JSON.stringify({
    source: original.source, checkedAt: original.checkedAt,
    original: { id: original.id, article: original.article, name: original.name, quantity: original.quantity },
    candidates: result.items.map(item => ({ id: item.product.id, article: item.product.article,
      name: item.product.name, quantity: item.product.quantity, reasons: item.reasons,
      differences: item.differences, requiresReview: item.requiresReview })),
    elapsedMs: Math.round(performance.now() - started), incomplete: result.incomplete,
    warnings: result.warnings,
  }, null, 2));
  if (original.quantity !== 0 || !result.items.length) {
    console.error("Сценарий изменился: исходный товар уже доступен или проверенный кандидат не подходит/недоступен.");
    process.exitCode = 2;
  }
} catch (error) {
  console.error(error instanceof CatalogError ? `${error.code}: ${error.message}` : "Проверка аналога не выполнена.");
  process.exitCode = 1;
}
