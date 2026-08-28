# ==============================================================================
# Jantt Monorepo Automation Makefile
# ==============================================================================

.PHONY: help install dev build test typecheck clean docker-build docker-up docker-down

help:
	@echo "Jantt Development Commands:"
	@echo "  make install       Install dependencies cleanly"
	@echo "  make dev           Launch live playground development server"
	@echo "  make build         Compile all monorepo packages"
	@echo "  make test          Run test suite across all packages"
	@echo "  make typecheck     Validate TypeScript types"
	@echo "  make clean         Remove build artifacts and temporary files"
	@echo "  make docker-build  Build production Docker container image"
	@echo "  make docker-up     Start Docker Compose container services"
	@echo "  make docker-down   Stop Docker Compose container services"

install:
	npm install

dev:
	npm run dev

build:
	npm run build

test:
	npm test

typecheck:
	npm run typecheck

clean:
	rm -rf dist packages/*/dist apps/*/dist packages/*/.vite apps/*/.vite **/*.tsbuildinfo

docker-build:
	docker build -t jantt-playground:latest .

docker-up:
	docker compose up -d

docker-down:
	docker compose down
