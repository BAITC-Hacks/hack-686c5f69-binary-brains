import { CatalogError } from "./types.ts";
import type { CatalogSource } from "./types.ts";

export function createEktSource(options: {
  username: string;
  password: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): CatalogSource {
  if (typeof window !== "undefined") throw new CatalogError("SERVER_ONLY", "Каталог доступен только на сервере.");
  if (!options.username || !options.password || options.username.includes(":")) {
    throw new CatalogError("CONFIG", "Задайте EKT_API_USERNAME и EKT_API_PASSWORD на сервере.");
  }
  const request = options.fetchImpl ?? fetch;
  const authorization = `Basic ${Buffer.from(`${options.username}:${options.password}`).toString("base64")}`;
  async function read(path: string): Promise<unknown> {
    try {
      const response = await request(`https://ekt.kz/api/${path}`, {
        headers: { Authorization: authorization, Accept: "application/json" },
        signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
        redirect: "error", cache: "no-store",
      });
      if (!response.ok) {
        const code = response.status === 404 ? "NOT_FOUND" : response.status === 401 || response.status === 403 ? "AUTH" : "UPSTREAM";
        throw new CatalogError(code, `API каталога вернул HTTP ${response.status}.`);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof CatalogError) throw error;
      if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
        throw new CatalogError("TIMEOUT", "API каталога не ответил вовремя. Повторите запрос позже.");
      }
      // Never include upstream bodies, URLs with credentials, or raw fetch errors.
      throw new CatalogError("UPSTREAM", "Не удалось получить данные каталога. Попробуйте позже.");
    }
  }
  return {
    mode: "ekt_api",
    listPage(page) {
      if (!Number.isSafeInteger(page) || page < 1) throw new CatalogError("INPUT", "Некорректный номер страницы.");
      return read(`products?page=${page}`);
    },
    getDetail(id) {
      if (!/^\d+$/.test(id)) throw new CatalogError("INPUT", "Некорректный id товара.");
      return read(`products/detail?id=${encodeURIComponent(id)}`);
    },
  };
}
