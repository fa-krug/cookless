# Cookless Implementation Plan - Overview

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a meal planning PWA that minimizes cooking effort through batch cooking and ingredient overlap optimization.

**Architecture:** Django + DRF backend serving a React PWA via WhiteNoise in a single container. Cookie auth for frontend, token auth for programmatic API. Multi-user with households and Sign in with Apple.

**Tech Stack:** Python 3.13, Django 5.x, DRF, React 19, TypeScript, Vite, Tailwind CSS, TanStack Query, react-i18next, Workbox

---

## Phase Index

| Phase | Tasks | Description | Plan File |
|-------|-------|-------------|-----------|
| 1 | 1-5 | Project scaffolding (Django, React, Docker, CI) | [Phase 01](2026-02-24-cookless-phase-01-project-scaffolding.md) |
| 2 | 6-11 | User model, households, permissions, Apple auth | [Phase 02](2026-02-24-cookless-phase-02-user-household-models.md) |
| 3 | 12-15 | Ingredient, Unit, Recipe models and API | [Phase 03](2026-02-24-cookless-phase-03-recipe-models-api.md) |
| 4 | 16-18 | Meal plan generation algorithm and API | [Phase 04](2026-02-24-cookless-phase-04-meal-plan-generation.md) |
| 5 | 19-20 | Shopping list generation and API | [Phase 05](2026-02-24-cookless-phase-05-shopping-list.md) |
| 6 | 21 | Health check endpoint | [Phase 06](2026-02-24-cookless-phase-06-health-endpoint.md) |
| 7 | 22-31 | Frontend pages (all 8 views) | [Phase 07](2026-02-24-cookless-phase-07-frontend-implementation.md) |
| 8 | 32 | PWA offline support | [Phase 08](2026-02-24-cookless-phase-08-pwa-offline.md) |
| 9 | 33 | Django serves React build | [Phase 09](2026-02-24-cookless-phase-09-django-static-serving.md) |
| 10 | 34 | Admin and seed data | [Phase 10](2026-02-24-cookless-phase-10-seed-data-admin.md) |
| 11 | 35-36 | Integration tests, docs, cleanup | [Phase 11](2026-02-24-cookless-phase-11-final-integration.md) |

## Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| 1 | 1-5 | Project scaffolding (Django, React, Docker, CI) |
| 2 | 6-11 | User model, households, permissions, Apple auth |
| 3 | 12-15 | Ingredient, Unit, Recipe models and API |
| 4 | 16-18 | Meal plan generation algorithm and API |
| 5 | 19-20 | Shopping list generation and API |
| 6 | 21 | Health check endpoint |
| 7 | 22-31 | Frontend pages (all 8 views) |
| 8 | 32 | PWA offline support |
| 9 | 33 | Django serves React build |
| 10 | 34 | Admin and seed data |
| 11 | 35-36 | Integration tests, docs, cleanup |
