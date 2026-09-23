"""Stdlib-only example for participant 2. Start npm run start:catalog:demo first."""
import json
import argparse
from urllib.parse import urlencode
from urllib.request import Request, urlopen

BASE_URL = "http://127.0.0.1:3001"


def catalog_request(path, body=None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = Request(BASE_URL + path, data=data, headers={"Content-Type": "application/json"})
    with urlopen(request, timeout=30) as response:
        return json.load(response)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Catalog HTTP integration example")
    parser.add_argument("--live", action="store_true", help="Use the verified live luminaire scenario")
    args = parser.parse_args()
    article = "150100708_" if args.live else "DEMO-160-OLD"
    search = catalog_request("/products/search?" + urlencode({"q": article}))
    if not search["items"]:
        raise SystemExit("Product not found. Check the server mode and indexed pages.")
    product = catalog_request("/products/" + search["items"][0]["id"])
    profile = {
        "category": "Светильники для внутреннего освещения",
        "requiredProperties": ["TIP_TSOKOLYA", "SPOSOB_MONTAZHA", "TIP_ISTOCHNIKA", "MATERIAL_KORPUSA",
                               "TIP_SVETILNIKA", "TEXT_LAMP_COUNT", "TEXT_DIAMETER_MM", "TEXT_IP_RATING"],
    } if args.live else {
        "category": "circuit-breaker",
        "requiredProperties": ["NOMINALNYY_TOK", "POLES", "BREAKING_CAPACITY_KA", "TRIP_TYPE", "VOLTAGE"],
    }
    alternatives = catalog_request("/alternatives", {
        "productId": product["id"],
        **profile,
        "quantity": 1 if args.live else 2,
        "limit": 1 if args.live else 3,
    })
    print(json.dumps({"product": product, "alternatives": alternatives}, ensure_ascii=False, indent=2))
