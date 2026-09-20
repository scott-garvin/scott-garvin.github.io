FROM python:3.12-slim
WORKDIR /project
COPY backend /project/backend
COPY data /project/data
RUN pip install --no-cache-dir -r backend/requirements.lock && pip install --no-deps ./backend
RUN useradd --create-home app
USER app
WORKDIR /project/backend
ENV PYTHONUNBUFFERED=1
ENV HARBOR_PROJECT_DIR=/project
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
