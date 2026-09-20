"""One service serves the exported frontend and same-origin Python API."""

import os

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.main import create_app

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
app.mount("/api", create_app())
app.mount("/", StaticFiles(directory=os.environ["HARBOR_STATIC_DIR"], html=True))
