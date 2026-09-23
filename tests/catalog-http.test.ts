import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { createCatalogService } from "../src/lib/catalog/service.ts";
import { createDemoSource, demoProfile } from "../src/lib/catalog/demo.ts";
import { createCatalogHttpServer } from "../src/lib/catalog/http.ts";

test("HTTP contract works for Python clients: search, detail, alternatives and input errors", async t => {
  const catalog = createCatalogService(createDemoSource());
  await catalog.refreshIndex({ maxPages: 3 });
  const server = createCatalogHttpServer(catalog);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.closeAllConnections(); return new Promise<void>(resolve => server.close(() => resolve())); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const search = await fetch(`${base}/products/search?q=DEMO-160-OLD`);
  assert.equal(search.status, 200);
  assert.equal(search.headers.get("cache-control"), "no-store");
  const result = await search.json();
  const product = await (await fetch(`${base}/products/${result.items[0].id}`)).json();
  assert.equal(product.article, "DEMO-160-OLD");
  assert.equal(product.quantity, 0);
  const alternatives = await fetch(`${base}/alternatives`, { method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId: product.id, ...demoProfile, quantity: 2 }) });
  assert.equal(alternatives.status, 200);
  assert.equal((await alternatives.json()).items[0].product.article, "DEMO-160-NEW");
  assert.equal((await fetch(`${base}/products/search?q=x&limit=abc`)).status, 400);
  assert.equal((await fetch(`${base}/products/missing`)).status, 404);
  assert.equal((await fetch(`${base}/products/%ZZ`)).status, 400);
  const invalid = await fetch(`${base}/alternatives`, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: '{"productId":123}' });
  assert.equal(invalid.status, 400);
  assert.equal((await fetch(`${base}/health`)).status, 200);
});
