import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCatalogService } from "../src/lib/catalog/service.ts";
import { createEktSource } from "../src/lib/catalog/api.ts";
import { normalizeProduct } from "../src/lib/catalog/normalize.ts";
import { createCatalogHttpServer } from "../src/lib/catalog/http.ts";
import { createDemoSource, demoProducts } from "../src/lib/catalog/demo.ts";
import { findAlternatives } from "../src/lib/alternatives/index.ts";
import { indoorE27Profile } from "../src/lib/alternatives/profiles.ts";
import type { AddressInfo } from "node:net";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/ekt-sample.json", import.meta.url), "utf8"));
const sample = (id: string) => structuredClone(fixture.products.find((p: { raw: { id: number } }) => String(p.raw.id) === id).raw);

test("ordinary search finds a relevant candidate beyond the first 30 catalog entries", async () => {
  const origin = sample("18161");
  const candidate = sample("23181");
  const unrelated = Array.from({ length: 40 }, (_, n) => ({ ...demoProducts[2], id: `other-${n}` }));
  const products = [origin, ...unrelated, candidate];
  const catalog = createCatalogService({ mode: "ekt_api",
    async listPage(page) { return { items: page === 1 ? products : [] }; },
    async getDetail(id) { return products.find(product => String(product.id) === id); },
  });
  await catalog.refreshIndex();
  const result = await findAlternatives(catalog, "18161", indoorE27Profile);
  assert.equal(result.items[0]?.product.id, "23181");
  assert.equal(result.incomplete, true);
});

test("a series range with units on both endpoints is not a product-current conflict", () => {
  const product = normalizeProduct({ ...demoProducts[0],
    description: "Серия: номинальный ток 6 А — 250 А.",
  }, "ekt_api");
  assert.equal(product.conflicts.length, 0);
  const singleValue = normalizeProduct({ ...demoProducts[0],
    description: "Номинальный ток 250 А, напряжение 400 В.",
  }, "ekt_api");
  assert.ok(singleValue.conflicts.some(conflict => conflict.property === "NOMINALNYY_TOK"));
});

test("conflicting lamp socket in API properties and description blocks recommendations", async () => {
  const origin = sample("18161");
  const candidate = sample("23181");
  origin.properties.TIP_TSOKOLYA = "E14";
  candidate.properties.TIP_TSOKOLYA = "E14";
  const product = normalizeProduct(origin, "ekt_api");
  assert.ok(product.conflicts.some(conflict => conflict.property === "TIP_TSOKOLYA"));
  const compact = normalizeProduct({ ...origin, name: "Светильник 2xE27", description: "Цоколь 2xE27. IP20" }, "ekt_api");
  assert.ok(compact.conflicts.some(conflict => conflict.property === "TIP_TSOKOLYA"));
  const catalog = createCatalogService({ mode: "ekt_api", async listPage() { return { items: [] }; },
    async getDetail(id) { return id === "18161" ? origin : candidate; } });
  assert.equal((await findAlternatives(catalog, "18161", { ...indoorE27Profile, candidateIds: ["23181"] })).items.length, 0);
});

test("oversized JSON gets a usable HTTP error and the server stays available", async t => {
  const catalog = createCatalogService(createDemoSource());
  await catalog.refreshIndex();
  const server = createCatalogHttpServer(catalog);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise<void>(resolve => server.close(() => resolve())); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const response = await fetch(`${base}/alternatives`, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ padding: "x".repeat(20000) }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "INPUT");
  assert.equal((await fetch(`${base}/health`)).status, 200);
});

test("a slow candidate request is cancelled when the total search deadline expires", async () => {
  let cancelled = false;
  const source = createEktSource({ username: "test", password: "test", fetchImpl: (async (url, init) => {
    if (String(url).endsWith("id=18161")) return new Response(JSON.stringify(sample("18161")));
    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(new Response(JSON.stringify(sample("23181")))), 2000);
      const signal = init!.signal!;
      const cancel = () => { cancelled = true; clearTimeout(timer); reject(signal.reason); };
      if (signal.aborted) cancel();
      else signal.addEventListener("abort", cancel, { once: true });
    });
  }) as typeof fetch });
  const result = await findAlternatives(createCatalogService(source), "18161", {
    ...indoorE27Profile, candidateIds: ["23181"], maxDurationMs: 100,
  });
  assert.equal(cancelled, true);
  assert.equal(result.incomplete, true);
  assert.equal(result.items.length, 0);
  assert.ok(result.warnings.some(warning => warning.includes("лимит времени")));
});
