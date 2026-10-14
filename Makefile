# ScamShield developer commands. Run `make help` for a list.
SHELL := /bin/bash
COMPOSE := docker compose

.PHONY: help env demo up down reset logs ps install test test-node test-ml e2e loadtest train

help: ## Show available commands
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-10s %s\n", $$1, $$2}'

env: ## Create .env from .env.example if missing
	@test -f .env || cp .env.example .env

demo: env ## Build and start everything, wait until ready, print demo accounts
	$(COMPOSE) up --build -d
	@./scripts/wait-for-stack.sh

up: env ## Start the stack without rebuilding
	$(COMPOSE) up -d

down: ## Stop the stack (keeps data)
	$(COMPOSE) down

reset: ## Stop the stack and delete all data volumes
	$(COMPOSE) down -v

logs: ## Follow logs of all services
	$(COMPOSE) logs -f --tail=100

ps: ## Show service status
	$(COMPOSE) ps

install: ## Install Node and Python dependencies for local development
	npm install
	npm run build:shared
	npx -w @scamshield/api prisma generate
	python3 -m venv services/ml/.venv && services/ml/.venv/bin/pip install -q -r services/ml/requirements-dev.txt

test: test-node test-ml ## Run all unit/integration tests (needs postgres + redis from compose)

test-node: env ## Node tests (the API suite recreates its own scamshield_test database)
	$(COMPOSE) up -d --wait postgres redis
	npm run build:shared
	npx -w @scamshield/api prisma generate >/dev/null
	npm test

test-ml: ## Python tests (feature parity + scoring contract); trains a local model first if needed
	cd services/ml && .venv/bin/python -m scamshield_ml.pipeline && .venv/bin/python -m pytest -q -W ignore

e2e: ## Playwright end-to-end test against the running stack (make demo first)
	npx -w @scamshield/web playwright test

loadtest: ## Load test POST /api/payments/check against the running stack
	node scripts/loadtest.mjs

train: ## Regenerate synthetic data, retrain and evaluate the model inside the ML container
	$(COMPOSE) exec ml python -m scamshield_ml.pipeline --force
	$(COMPOSE) exec ml python -c "import urllib.request as u; u.urlopen(u.Request('http://localhost:8000/reload', method='POST'))"
