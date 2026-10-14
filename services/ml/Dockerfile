# Build context: repository root (the ML service reads the shared feature/rule spec).
FROM python:3.11-slim
WORKDIR /app/services/ml
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 MPLBACKEND=Agg \
    SHARED_SPEC_DIR=/app/packages/shared/spec MODEL_DIR=/app/services/ml/models DATA_DIR=/app/services/ml/data
COPY services/ml/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY packages/shared/spec /app/packages/shared/spec
COPY services/ml /app/services/ml
EXPOSE 8000
CMD ["sh", "entrypoint.sh"]
