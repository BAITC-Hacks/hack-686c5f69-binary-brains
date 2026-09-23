import { createCatalogService } from "../src/lib/catalog/index.ts";
import { createDemoSource, demoProfile } from "../src/lib/catalog/demo.ts";
import { findAlternatives } from "../src/lib/alternatives/index.ts";

const catalog = createCatalogService(createDemoSource());
await catalog.refreshIndex();
console.log("ДЕМОНСТРАЦИЯ: все товары и цены синтетические.");
console.log("Поиск:", catalog.searchProducts("DEMO-160-OLD"));
console.log("Карточка:", await catalog.getProduct("demo-1"));
console.log("Аналог:", JSON.stringify(await findAlternatives(catalog, "demo-1", { ...demoProfile, quantity: 2 }), null, 2));
console.log("Конфликт:", (await catalog.getProduct("demo-4")).conflicts);
