import type { CartClient } from "./types";

export const demoCartClient: CartClient = {
  async addItems(_items, sessionId) {
    return {
      cartUrl: `/cart?session=${encodeURIComponent(sessionId)}`,
    };
  },
};
