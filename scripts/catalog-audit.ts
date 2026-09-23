import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createEktSource, CatalogError } from "../src/lib/catalog/index.ts";
import { normalizeSummary, normalizeProduct, record } from "../src/lib/catalog/normalize.ts";

function option(name: string, fallback: number, max: number) {
  const value = Number(process.argv.find(arg => arg.startsWith(`--${name}=`))?.split("=")[1] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`Invalid ${name}`);
  return value;
}

try {
  const firstPage = option("page", 1, 10000);
  const pages = option("pages", 2, 10);
  const maxDetails = option("details", 20, 100);
  const source = createEktSource({ username: process.env.EKT_API_USERNAME ?? "", password: process.env.EKT_API_PASSWORD ?? "" });
  await mkdir(".local/catalog-audit", { recursive: true });
  const ids = new Set<string>();
  for (let page = firstPage; page < firstPage + pages; page++) {
    const raw = record(await source.listPage(page));
    if (!Array.isArray(raw.items)) throw new CatalogError("INVALID_DATA", "Missing items");
    await writeFile(`.local/catalog-audit/page-${page}.json`, JSON.stringify({ capturedAt: new Date().toISOString(), raw }, null, 2));
    for (const item of raw.items) ids.add(normalizeSummary(item).id);
    if (!raw.items.length) break;
  }
  let read = 0;
  let cached = 0;
  let failed = 0;
  const summaries: unknown[] = [];
  for (const id of [...ids].slice(0, maxDetails)) {
    try {
      let raw: unknown;
      try {
        const saved = JSON.parse(await readFile(`.local/catalog-audit/product-${id}.json`, "utf8"));
        raw = saved.raw;
        cached++;
      } catch {
        raw = await source.getDetail(id);
        await writeFile(`.local/catalog-audit/product-${id}.json`, JSON.stringify({ capturedAt: new Date().toISOString(), raw }, null, 2));
        read++;
      }
      const product = normalizeProduct(raw, "ekt_api");
      summaries.push({ id, article: product.article, name: product.name, quantity: product.quantity,
        category: product.category, properties: product.properties, conflicts: product.conflicts,
        certificateCount: product.certificates.length });
      console.log(JSON.stringify({ id, quantity: product.quantity, category: product.category, conflicts: product.conflicts.length }));
    } catch (error) {
      failed++;
      console.log(JSON.stringify({ id, error: error instanceof CatalogError ? error.code : "READ_FAILED" }));
    }
  }
  await writeFile(`.local/catalog-audit/summary-${firstPage}-${pages}.json`, JSON.stringify(summaries, null, 2));
  console.log(JSON.stringify({ indexed: ids.size, read, cached, failed,
    note: "Local audit snapshots only; never use captured stock as live availability." }));
} catch (error) {
  console.error(error instanceof CatalogError ? `${error.code}: ${error.message}` : "Catalog audit failed.");
  process.exitCode = 1;
}
