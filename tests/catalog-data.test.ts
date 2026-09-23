import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeProduct } from "../src/lib/catalog/normalize.ts";
import { createCatalogService } from "../src/lib/catalog/service.ts";
import { findAlternatives } from "../src/lib/alternatives/index.ts";
import { indoorE27Profile } from "../src/lib/alternatives/profiles.ts";
import { demoProducts } from "../src/lib/catalog/demo.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/ekt-sample.json", import.meta.url), "utf8"));
const sample = (id: string) => structuredClone(fixture.products.find((p: { raw: { id: number } }) => String(p.raw.id) === id).raw);

test("API sample: out-of-stock luminaire yields a stocked candidate and exposes reduced flux", async () => {
  const calls: string[] = [];
  const catalog = createCatalogService({ mode: "ekt_api",
    async listPage() { throw new Error("Targeted search must not enumerate unrelated products"); },
    async getDetail(id) { calls.push(id); return sample(id); },
  });
  const result = await findAlternatives(catalog, "18161", { ...indoorE27Profile, candidateIds: ["23181", "23181"], quantity: 1 });
  assert.deepEqual(calls, ["18161", "23181"]);
  assert.equal(sample("18161").quantity, 0);
  assert.equal(result.items[0].product.article, "150100705_");
  assert.equal(result.items[0].product.quantity, 3);
  assert.equal(result.items[0].product.categorySource, "properties.KATEGORIYA_SVETILNIKA");
  assert.ok(result.items[0].differences.includes("Световой поток, лм: 1465 → 1152"));
  assert.ok(result.items[0].differences.some(text => text.startsWith("Рассеиватель:")));
  assert.ok(result.items[0].differences.every(text => !text.includes("CML2_")));
  assert.equal(result.items[0].requiresReview, true);
  assert.equal(result.incomplete, true);
});

test("text-derived matching has evidence and rejects an incompatible number of lamps", async () => {
  const product = normalizeProduct(sample("18161"), "ekt_api");
  assert.equal(product.properties.TEXT_LAMP_COUNT, 2);
  assert.equal(product.properties.TEXT_DIAMETER_MM, 400);
  assert.equal(product.properties.TEXT_IP_RATING, "IP20");
  assert.equal(product.textPropertyEvidence.TEXT_DIAMETER_MM.text, "Диаметр: 400 мм");
  const candidate = sample("23181");
  candidate.name = "AKASYA 1xE27";
  const conflicting = normalizeProduct(candidate, "ekt_api");
  assert.ok(conflicting.conflicts.some(conflict => conflict.property === "TEXT_LAMP_COUNT"));
  const catalog = createCatalogService({ mode: "ekt_api", async listPage() { return { items: [] }; },
    async getDetail(id) { return id === "18161" ? sample(id) : candidate; } });
  assert.equal((await findAlternatives(catalog, "18161", { ...indoorE27Profile, candidateIds: ["23181"] })).items.length, 0);
});

test("fresh stock and missing specifications can invalidate a known candidate", async () => {
  for (const mode of ["out_of_stock", "missing_ip"] as const) {
    const candidate = sample("23181");
    if (mode === "out_of_stock") candidate.quantity = 0;
    else candidate.description = candidate.description.replace("IP20", "");
    const catalog = createCatalogService({ mode: "ekt_api", async listPage() { return { items: [] }; },
      async getDetail(id) { return id === "18161" ? sample(id) : candidate; } });
    assert.equal((await findAlternatives(catalog, "18161", { ...indoorE27Profile, candidateIds: ["23181"] })).items.length, 0);
  }
});

test("series current ranges and breaking capacity are not nominal-current conflicts", () => {
  assert.equal(normalizeProduct(sample("33700"), "ekt_api").conflicts.length, 0);
  assert.equal(normalizeProduct(sample("24165"), "ekt_api").conflicts.length, 0);
  const genuine = normalizeProduct({ ...demoProducts[0], description: "Номинальный ток: 250 А." }, "ekt_api");
  assert.ok(genuine.conflicts.some(conflict => conflict.property === "NOMINALNYY_TOK"));
});

test("certificate extractor merges fields, follows file wrappers and deduplicates links", () => {
  const product = normalizeProduct({ ...demoProducts[0], certificates: [],
    certificate: { url: "/upload/cert.pdf", name: "Сертификат соответствия" },
    properties: { CERTIFICATES: { VALUE: [{ SRC: "/upload/cert.pdf" }, { FILE: { SRC: "/upload/second.pdf" } }] } },
  }, "ekt_api");
  assert.equal(product.certificateStatus, "available");
  assert.equal(product.certificates[0].name, "Сертификат соответствия");
  assert.deepEqual(product.certificates.map(cert => cert.url), ["https://ekt.kz/upload/cert.pdf", "https://ekt.kz/upload/second.pdf"]);
});

test("certificate IDs and invalid links are unresolved, never fabricated URLs", () => {
  const idOnly = normalizeProduct({ ...demoProducts[0], properties: [{ CODE: "SERTIFIKAT", VALUE: 12345 }] }, "ekt_api");
  assert.equal(idOnly.certificateStatus, "unresolved");
  assert.equal(idOnly.certificates.length, 0);
  const unsafe = normalizeProduct({ ...demoProducts[0], certificates: ["javascript:alert(1)", "data:text/html,test"] }, "ekt_api");
  assert.equal(unsafe.certificates.length, 0);
  assert.equal(unsafe.certificateStatus, "unresolved");
  assert.equal(normalizeProduct(demoProducts[0], "ekt_api").certificateStatus, "not_provided");
});
