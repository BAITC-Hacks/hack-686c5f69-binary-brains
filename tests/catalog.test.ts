import { test } from "node:test";
import assert from "node:assert/strict";
import { createCatalogService, createEktSource } from "../src/lib/catalog/index.ts";
import { normalizeProduct } from "../src/lib/catalog/normalize.ts";
import { createDemoSource, demoProducts, demoProfile } from "../src/lib/catalog/demo.ts";
import { findAlternatives } from "../src/lib/alternatives/index.ts";
import { equivalentProperty } from "../src/lib/alternatives/compare.ts";

test("pagination does not interpret count as catalog total; exact article wins", async () => {
  const catalog = createCatalogService(createDemoSource());
  const index = await catalog.refreshIndex();
  assert.equal(index.items.length, 4);
  assert.equal(index.pagesRead, 3);
  assert.equal(index.complete, true);
  const result = catalog.searchProducts(" demo-160-old ");
  assert.equal(result.match, "exact_article");
  assert.equal(result.items[0].id, "demo-1");
  assert.equal(catalog.searchProducts("автомат 250А").items[0].id, "demo-3");
});

test("partial catalog cannot establish absence; returned index is isolated", async () => {
  const catalog = createCatalogService(createDemoSource());
  const index = await catalog.refreshIndex({ maxPages: 1 });
  index.items.length = 0;
  assert.equal(catalog.getIndex().items.length, 2);
  assert.equal(catalog.searchProducts("missing").coverage.complete, false);
  assert.match(catalog.searchProducts("missing").warning!, /выборке/);
});

test("repeating endpoint terminates without claiming completeness", async () => {
  const source = createDemoSource();
  source.listPage = async () => ({ items: [demoProducts[0]], count: 1 });
  const index = await createCatalogService(source).refreshIndex({ maxPages: 20 });
  assert.equal(index.stopReason, "repeated_page");
  assert.equal(index.complete, false);
  assert.equal(index.pagesRead, 2);
});

test("failed refresh preserves previous valid snapshot", async () => {
  const source = createDemoSource();
  const catalog = createCatalogService(source);
  await catalog.refreshIndex();
  source.listPage = async () => ({ items: "invalid" });
  await assert.rejects(catalog.refreshIndex(), { code: "INVALID_DATA" });
  assert.equal(catalog.getIndex().items.length, 4);
});

test("detail is fetched fresh on every call and wrong IDs are rejected", async () => {
  const source = createDemoSource();
  let quantity = 2;
  source.getDetail = async () => ({ ...demoProducts[0], quantity: quantity-- });
  const catalog = createCatalogService(source);
  assert.equal((await catalog.getProduct("demo-1")).quantity, 2);
  assert.equal((await catalog.getProduct("demo-1")).quantity, 1);
  await assert.rejects(catalog.getProduct("demo-2"), { code: "INVALID_DATA" });
});

test("missing and malformed numeric data is unknown, never zero", () => {
  const product = normalizeProduct({ ...demoProducts[0], price: null, quantity: "", currency: undefined }, "ekt_api");
  assert.equal(product.price, null);
  assert.equal(product.quantity, null);
  assert.equal(product.currency, null);
  assert.equal(product.availability, "unknown");
  assert.equal(normalizeProduct({ ...demoProducts[0], quantity: -1 }, "ekt_api").quantity, null);
  assert.equal(normalizeProduct({ ...demoProducts[0], quantity: 0 }, "ekt_api").availability, "out_of_stock");
});

test("warehouse stock is normalized without treating warehouse totals as sellable stock", () => {
  const product = normalizeProduct({ ...demoProducts[0], quantity: 2, stores: [
    { id: 2, name: "Брак MEGALIGHT", quantity: 5 },
    { id: 12, name: "Основной склад", quantity: "2" },
    { id: 13, name: "Алматы", quantity: null },
  ] }, "ekt_api");
  assert.deepEqual(product.stores.map(store => store.quantity), [5, 2, null]);
  assert.equal(product.stores[1].id, "12");
  assert.equal(product.quantity, 2);
});

test("category comes from the observed KATEGORIYA field with explicit provenance", () => {
  const input = { ...demoProducts[0], category: undefined, properties: {
    KATEGORIYA: { VALUE: "Коробка распределительная" }, OBYEM: "Other field",
  } };
  const product = normalizeProduct(input, "ekt_api");
  assert.equal(product.category, "Коробка распределительная");
  assert.equal(product.categorySource, "properties.KATEGORIYA");
  const explicit = normalizeProduct({ ...input, category: "Explicit category" }, "ekt_api");
  assert.equal(explicit.category, "Explicit category");
  assert.equal(explicit.categorySource, "category");
  const unknown = normalizeProduct({ ...input, properties: { OBYEM: "Автоматический выключатель" } }, "ekt_api");
  assert.equal(unknown.category, null);
});

test("equivalent electrical units match but changed ratings or ambiguous units do not", () => {
  assert.equal(equivalentProperty("NOMINALNYY_TOK", "40А", "40 A"), true);
  assert.equal(equivalentProperty("NOMINALNAYA_OTKLYUCHAYUSHCHAYA_SPOSOBNOST", "18кА", "18000 A"), true);
  assert.equal(equivalentProperty("NOMINALNOE_NAPRYAZHENIE", "0,4 кВ", "400 V"), true);
  assert.equal(equivalentProperty("NOMINALNYY_TOK", "40А", "40 mA"), false);
  assert.equal(equivalentProperty("NOMINALNYY_TOK", "40 MA", "40 mA"), false);
  assert.equal(equivalentProperty("NOMINALNYY_TOK", "40А", "50 A"), false);
  assert.equal(equivalentProperty("NOMINALNYY_TOK", "40А", "40 V"), false);
  assert.equal(equivalentProperty("NOMINALNYY_TOK", 40, "40 A"), false);
  assert.equal(equivalentProperty("UNKNOWN", "40А", "40 A"), false);
});

test("alternative matcher applies unit normalization end to end", async () => {
  const source = createDemoSource();
  const originalGet = source.getDetail;
  source.getDetail = async id => {
    const product = await originalGet(id) as typeof demoProducts[number];
    return { ...product, properties: { ...product.properties, NOMINALNYY_TOK: id === "demo-1" ? "160А" : id === "demo-2" ? "160 A" : "250 А" } };
  };
  const catalog = createCatalogService(source);
  await catalog.refreshIndex();
  const result = await findAlternatives(catalog, "demo-1", demoProfile);
  assert.deepEqual(result.items.map(item => item.product.id), ["demo-2"]);
});

test("upstream timeout gets an actionable error without leaking request details", async () => {
  const source = createEktSource({ username: "test", password: "test",
    fetchImpl: (async () => { throw new DOMException("private", "TimeoutError"); }) as typeof fetch });
  await assert.rejects(source.getDetail("515291"), { code: "TIMEOUT" });
});

test("160A/250A contradiction is exposed; model name and kA do not cause false conflict", () => {
  const conflicting = normalizeProduct(demoProducts[3], "demo");
  assert.equal(conflicting.conflicts[0].property, "NOMINALNYY_TOK");
  assert.deepEqual(conflicting.conflicts[0].values, ["160", "250"]);
  const valid = normalizeProduct({ ...demoProducts[0], name: "DRX250 160А 18ka" }, "demo");
  assert.equal(valid.conflicts.length, 0);
  assert.equal(valid.minimumOrder.verified, false);
});

test("certificates are sourced from data; unsafe links are rejected", () => {
  assert.equal(normalizeProduct(demoProducts[1], "demo").certificates.length, 1);
  assert.equal(normalizeProduct(demoProducts[0], "demo").certificates.length, 0);
  const product = normalizeProduct({ ...demoProducts[0], image: "javascript:alert(1)",
    certificates: [{ url: "javascript:alert(1)" }] }, "demo");
  assert.equal(product.image, null);
  assert.equal(product.certificates.length, 0);
  assert.equal(normalizeProduct({ ...demoProducts[0], certificate: "yes" }, "demo").certificates.length, 0);
});

test("alternative has matching critical properties, stock and explicit differences", async () => {
  const catalog = createCatalogService(createDemoSource());
  await catalog.refreshIndex();
  const result = await findAlternatives(catalog, "demo-1", { ...demoProfile, quantity: 2 });
  assert.deepEqual(result.items.map(item => item.product.id), ["demo-2"]);
  assert.ok(result.items[0].reasons.some(reason => reason.includes("NOMINALNYY_TOK")));
  assert.ok(result.items[0].differences.some(reason => reason.includes("BRAND")));
  assert.equal(result.items[0].requiresReview, true);
  assert.equal(result.incomplete, false);
  assert.equal((await findAlternatives(catalog, "demo-1", { ...demoProfile, quantity: 10 })).items.length, 0);
});

test("conflicting origin, missing category and RECOMMEND cannot establish equivalence", async () => {
  const catalog = createCatalogService(createDemoSource());
  await catalog.refreshIndex();
  assert.equal((await findAlternatives(catalog, "demo-4", demoProfile)).items.length, 0);
  assert.equal((await findAlternatives(catalog, "demo-1", { ...demoProfile, category: "other" })).items.length, 0);
  await assert.rejects(findAlternatives(catalog, "demo-1", { ...demoProfile, requiredProperties: ["RECOMMEND"] }), { code: "INPUT" });
});

test("candidate failure is visible and does not discard other matches", async () => {
  const source = createDemoSource();
  const original = source.getDetail;
  source.getDetail = async id => { if (id === "demo-3") throw new Error("offline"); return original(id); };
  const catalog = createCatalogService(source);
  await catalog.refreshIndex();
  const result = await findAlternatives(catalog, "demo-1", demoProfile);
  assert.equal(result.items[0].product.id, "demo-2");
  assert.equal(result.incomplete, true);
  assert.ok(result.warnings.some(warning => warning.includes("demo-3")));
});

test("API uses fixed HTTPS origin, Basic Auth, no redirect and no cache", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const source = createEktSource({ username: "test-user", password: "test-password",
    fetchImpl: (async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ items: [] }));
    }) as typeof fetch });
  await source.listPage(2);
  await source.getDetail("515291");
  assert.equal(calls[0].url, "https://ekt.kz/api/products?page=2");
  assert.equal(calls[1].url, "https://ekt.kz/api/products/detail?id=515291");
  assert.equal(calls[0].init?.redirect, "error");
  assert.equal(calls[0].init?.cache, "no-store");
  assert.equal((calls[0].init?.headers as Record<string, string>).Authorization,
    `Basic ${Buffer.from("test-user:test-password").toString("base64")}`);
  assert.throws(() => source.getDetail("https://evil.invalid"), { code: "INPUT" });
});

test("API errors never include credentials or upstream body", async () => {
  const auth = createEktSource({ username: "secret", password: "secret-password",
    fetchImpl: (async () => new Response("private body secret-password", { status: 401 })) as typeof fetch });
  await assert.rejects(auth.listPage(1), error => {
    assert.equal((error as { code: string }).code, "AUTH");
    assert.doesNotMatch(String(error), /secret|private/);
    return true;
  });
  const broken = createEktSource({ username: "secret", password: "secret-password",
    fetchImpl: (async () => { throw new Error("secret-password"); }) as typeof fetch });
  await assert.rejects(broken.listPage(1), error => {
    assert.doesNotMatch(String(error), /secret/);
    return true;
  });
});
