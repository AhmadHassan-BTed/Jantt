# ==============================================================================
# Jantt Monorepo Automation Makefile
# ==============================================================================

.PHONY: help install install-dev dev build test typecheck lint clean docker-build docker-up docker-down

help:
	@echo "Jantt Development Commands:"
	@echo "  make install       Install dependencies exactly as locked (npm ci)"
	@echo "  make install-dev   Install and update package-lock.json (npm install)"
	@echo "  make dev           Launch live playground development server"
	@echo "  make build         Compile all monorepo packages"
	@echo "  make test          Run test suite across all packages (run 'make build' first)"
	@echo "  make typecheck     Validate TypeScript types (run 'make build' first)"
	@echo "  make lint          Typecheck plus syntax check of the JavaScript CLIs"
	@echo "  make clean         Remove build artifacts and temporary files"
	@echo "  make docker-build  Build production Docker container image"
	@echo "  make docker-up     Start Docker Compose container services"
	@echo "  make docker-down   Stop Docker Compose container services"

install:
	npm ci

install-dev:
	npm install

dev:
	npm run dev

build:
	npm run build

test:
	npm test

typecheck:
	npm run typecheck

lint:
	npm run lint

clean:
	npm run clean

docker-build:
	docker build -t jantt-playground:latest .

docker-up:
	docker compose up -d

docker-down:
	docker compose down
