"""
Mercado Libre OAuth Setup
Ejecutar: python3 ml_oauth.py

Pre-requisito: en tu app ML Developer configura esta Redirect URI:
    https://verken.cl
(ML redirigirá ahí con ?code=... en la URL — copia esa URL completa y pégala aquí)
"""

import webbrowser
import urllib.parse
import urllib.request
import json
import re
from pathlib import Path

CLIENT_ID = "3940234431856307"
CLIENT_SECRET = "ZB1MB5pNBIkZUp7qRNNwD7MaOmDJGBxZ"
REDIRECT_URI = "https://verken.cl"
AUTH_URL = (
    f"https://auth.mercadolibre.cl/authorization"
    f"?response_type=code&client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}"
)
TOKEN_URL = "https://api.mercadolibre.com/oauth/token"
ENV_FILE = Path(__file__).parent / "backend" / ".env"


def exchange_code(code: str) -> dict:
    data = urllib.parse.urlencode({
        "grant_type": "authorization_code",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "code": code,
        "redirect_uri": REDIRECT_URI,
    }).encode()
    req = urllib.request.Request(TOKEN_URL, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")
    req.add_header("Accept", "application/json")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def extract_code_from_url(url: str) -> str | None:
    """Extrae el code= de una URL completa o lo devuelve directo si ya es el código."""
    url = url.strip()
    if url.startswith("https://") or url.startswith("http://"):
        params = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        return params.get("code", [None])[0]
    # El usuario pegó el código directamente
    if len(url) > 10 and " " not in url:
        return url
    return None


def update_env(access_token: str, refresh_token: str, seller_id: str):
    content = ENV_FILE.read_text()
    content = re.sub(r"MERCADOLIBRE_REFRESH_TOKEN=.*", f"MERCADOLIBRE_REFRESH_TOKEN={refresh_token}", content)
    content = re.sub(r"MERCADOLIBRE_ACCESS_TOKEN=.*", f"MERCADOLIBRE_ACCESS_TOKEN={access_token}", content)
    content = re.sub(r"MERCADOLIBRE_SELLER_ID=.*", f"MERCADOLIBRE_SELLER_ID={seller_id}", content)
    ENV_FILE.write_text(content)


def main():
    print()
    print("=" * 60)
    print("  Mercado Libre OAuth Setup — Verken Orders")
    print("=" * 60)
    print()
    print("PASO 1 — Abriendo el navegador para que autorices la app...")
    print()
    print("  El navegador te llevará a verken.cl (puede mostrar tu sitio")
    print("  normal o un 404 — eso está bien).")
    print()
    print("  Copia la URL completa de la barra del navegador y pégala")
    print("  aquí abajo. Se verá así:")
    print("  https://verken.cl?code=TG-XXXXXXXXXXXX-XXXXXXX")
    print()

    webbrowser.open(AUTH_URL)

    print("  (Si el navegador no se abrió, ve manualmente a:)")
    print(f"  {AUTH_URL}")
    print()

    raw = input("Pega aquí la URL (o solo el código): ").strip()
    code = extract_code_from_url(raw)

    if not code:
        print()
        print("ERROR: No se pudo extraer el código. Asegúrate de pegar")
        print("la URL completa que aparece en la barra del navegador.")
        return

    print()
    print("PASO 2 — Obteniendo tokens de acceso...")

    try:
        tokens = exchange_code(code)
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"ERROR HTTP {e.code}: {body}")
        return
    except Exception as e:
        print(f"ERROR: {e}")
        return

    access_token = tokens.get("access_token", "")
    refresh_token = tokens.get("refresh_token", "")
    seller_id = str(tokens.get("user_id", ""))

    if not access_token:
        print(f"ERROR: Respuesta inesperada: {tokens}")
        return

    print(f"  Access token: {access_token[:25]}...")
    print(f"  Seller ID:    {seller_id}")
    print()
    print("PASO 3 — Guardando en backend/.env...")
    update_env(access_token, refresh_token, seller_id)

    print()
    print("=" * 60)
    print("  ¡Configuración completa!")
    print(f"  Seller ID guardado: {seller_id}")
    print("  Reinicia el backend para aplicar los cambios:")
    print("  cd ~/verken-orders/backend && uvicorn main:app --reload")
    print("=" * 60)
    print()


if __name__ == "__main__":
    main()
