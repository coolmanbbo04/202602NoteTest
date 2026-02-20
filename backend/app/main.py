from fastapi import FastAPI
from .db import init_db
from .routes.health import router as health_router
from .routes.notes import router as notes_router

app = FastAPI(title="Notepad Web App API")

app.include_router(health_router)
app.include_router(notes_router)

@app.on_event("startup")
def _startup():
    init_db()
