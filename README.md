# hack-686c5f69-binary-brains
Hackathon team repository for binary brains

## Участник 2: ИИ-ассистент и обработка файлов

Зона ответственности:

- логика диалога в чате;
- хранение контекста сессии;
- вызов инструментов каталога: `searchProducts`, `getProduct`, `findAlternatives`;
- ответы про оплату, доставку и минимальную партию;
- извлечение позиций из JPEG, Excel, Word и PDF;
- уточняющие вопросы при неоднозначном запросе;
- подготовка ответа для интерфейса: текст, карточки товаров, ссылка на корзину после подтверждения.

### API

`POST /api/chat`

```json
{
  "sessionId": "optional-session-id",
  "message": "Есть ли автомат 16А?"
}
```

Ответ:

```json
{
  "sessionId": "session-id",
  "message": "Текст ответа ассистента",
  "cards": [],
  "needsConfirmation": true
}
```

`POST /api/upload`

`multipart/form-data`:

- `file` - JPEG, Excel, Word или PDF;
- `sessionId` - необязательный id сессии.

Ответ:

```json
{
  "sessionId": "session-id",
  "fileName": "specification.pdf",
  "items": []
}
```

### Интеграция с каталогом

Пока API участника 1 не готов, используется демо-клиент в `src/lib/assistant/catalogClient.ts`.
После готовности каталога нужно заменить демо-клиент на реальные функции:

- `searchProducts(query)`
- `getProduct(id)`
- `findAlternatives(productId, requirements)`

Данные доступа к API ekt.kz нельзя хранить в коде. Используйте переменные окружения:

```bash
EKT_API_BASE_URL=https://ekt.kz/api
EKT_API_USER=...
EKT_API_PASSWORD=...
```

### Ограничения демо

- Корзина сейчас демонстрационная: `src/lib/assistant/cartClient.ts` возвращает ссылку вида `/cart?session=...`.
- PDF/JPEG распознавание подготовлено как адаптеры. Для полноценного демо нужно подключить OCR и библиотеку чтения PDF.
- Ассистент не добавляет товар в корзину без явного подтверждения пользователя.
- Ассистент не принимает и не хранит платежные данные.
