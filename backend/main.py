import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from config import get_settings
from routers import orders, sync, dashboard
from routers import settings as settings_router
from jobs.daily_sync import run_daily_sync_sync, run_sync_only_sync

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

settings = get_settings()
scheduler = BackgroundScheduler(timezone=settings.scheduler_timezone)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Sync every 10 minutes
    scheduler.add_job(
        run_sync_only_sync,
        IntervalTrigger(minutes=10, timezone=settings.scheduler_timezone),
        id="sync_interval",
        replace_existing=True,
    )
    # Daily email report at configured hour (default 07:00 Santiago)
    scheduler.add_job(
        run_daily_sync_sync,
        CronTrigger(
            hour=settings.daily_sync_hour,
            minute=settings.daily_sync_minute,
            timezone=settings.scheduler_timezone,
        ),
        id="daily_report",
        replace_existing=True,
    )
    scheduler.start()
    logger.info(
        f"Scheduler started — sync every 10 min, daily report at "
        f"{settings.daily_sync_hour:02d}:{settings.daily_sync_minute:02d} "
        f"({settings.scheduler_timezone})"
    )
    yield
    # Shutdown
    scheduler.shutdown(wait=False)
    logger.info("Scheduler stopped")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(orders.router)
app.include_router(sync.router)
app.include_router(dashboard.router)
app.include_router(settings_router.router)


@app.get("/health")
def health_check():
    from database import get_supabase
    db_ok = False
    try:
        get_supabase().table("orders").select("id").limit(1).execute()
        db_ok = True
    except Exception:
        pass

    return {
        "status": "ok" if db_ok else "degraded",
        "database": "connected" if db_ok else "error",
        "scheduler_running": scheduler.running,
        "version": settings.app_version,
    }
