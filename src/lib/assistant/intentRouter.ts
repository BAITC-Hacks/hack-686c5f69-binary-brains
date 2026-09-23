export type AssistantIntent =
  | "confirm_add_to_cart"
  | "purchase_info"
  | "alternatives"
  | "product_lookup"
  | "clarification";

export function detectIntent(message: string): AssistantIntent {
  const normalized = message.toLowerCase();

  if (/(да|подтверждаю|добавь|добавить|оформи|в корзину)/i.test(normalized)) {
    return "confirm_add_to_cart";
  }

  if (/(оплат|достав|самовывоз|минимальн|партия|услов)/i.test(normalized)) {
    return "purchase_info";
  }

  if (/(аналог|замен|похож|альтернатив)/i.test(normalized)) {
    return "alternatives";
  }

  if (/(артикул|налич|цена|характерист|сертификат|товар|кабель|автомат|розет)/i.test(normalized)) {
    return "product_lookup";
  }

  return "clarification";
}
