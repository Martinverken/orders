# CLAUDE.md — Verken Orders

## Quick start
```bash
cd backend && pip install -r requirements.txt
cd backend && pytest -v
```

## Architecture
- **Backend**: FastAPI (Python 3.12) in `/backend/`, deployed to Railway
- **Frontend**: Next.js in `/frontend/`, deployed to Vercel
- **DB**: Supabase (PostgreSQL), migrations in `/supabase/migrations/`

## Backend structure
```
backend/
  config.py              # pydantic-settings (env vars)
  main.py                # FastAPI app entry point
  models/order.py        # OrderCreate, Order, compute_urgency
  integrations/
    base.py              # BaseIntegration ABC
    falabella/            # client.py, mapper.py, schemas.py
    mercadolibre/         # client.py, mapper.py, schemas.py
    walmart/              # client.py, mapper.py, schemas.py
    paris/                # client.py, mapper.py, schemas.py (stub)
    shopify/              # client.py, mapper.py, holidays.py
  services/              # orchestration: sync, order logic, email
  repositories/          # Supabase DB access layer
  routers/               # FastAPI route handlers
  tests/                 # pytest tests (run from backend/)
```

## Key patterns
- Each integration has a `mapper.py` with `to_order_create(raw: dict) -> OrderCreate | None`
- Mappers are pure functions: no DB, no HTTP, no side effects
- All integrations produce `OrderCreate` (defined in `models/order.py`)
- `compute_urgency()` determines order urgency from deadline + status
- Pydantic schemas use `extra = "allow"` to tolerate unknown API fields

## Testing
- Run: `cd backend && pytest -v`
- Tests focus on mappers (pure logic) and urgency computation
- No DB or HTTP required for current tests
- To test compute_urgency, monkeypatch `models.order._today_santiago`

## CI
- GitHub Actions: `.github/workflows/backend-tests.yml`
- Triggers on push to main and PRs touching `backend/**`
- Uses dummy env vars so tests never hit real services
