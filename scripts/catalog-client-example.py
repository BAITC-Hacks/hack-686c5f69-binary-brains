"""Stdlib-only example for participant 2. Start npm run start:catalog:demo first."""
import json
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE_URL = "http://127.0.0.1:3001"


def catalog_request(path, body=None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = Request(BASE_URL + path, data=data, headers={"Content-Type": "application/json"})
    with urlopen(request, timeout=30) as response:
        return json.load(response)


if __name__ == "__main__":
    search = catalog_request("/products/search?" + urlencode({"q": "DEMO-160-OLD"}))
    if not search["items"]:
        raise SystemExit("Demo product not found. Start the server with --demo.")
    product = catalog_request("/products/" + search["items"][0]["id"])
    alternatives = catalog_request("/alternatives", {
        "productId": product["id"],
        "category": "circuit-breaker",
        "requiredProperties": ["NOMINALNYY_TOK", "POLES", "BREAKING_CAPACITY_KA", "TRIP_TYPE", "VOLTAGE"],
        "quantity": 2,
    })
    print(json.dumps({"product": product, "alternatives": alternatives}, ensure_ascii=False, indent=2))
