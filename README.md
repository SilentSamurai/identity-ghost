# Auth Server

[![Build, Test & Create Docker Image](https://github.com/SilentSamurai/auth-server/actions/workflows/build.yaml/badge.svg)](https://github.com/SilentSamurai/auth-server/actions/workflows/build.yaml)
[![Build & Release Docker Image](https://github.com/SilentSamurai/auth-server/actions/workflows/release.yaml/badge.svg)](https://github.com/SilentSamurai/auth-server/actions/workflows/release.yaml)

A production-ready, OIDC-compatible OAuth Authorization service built with [NestJS](https://nestjs.com), [Angular](https://angular.io/), and [TypeScript](https://www.typescriptlang.org/).

## 📂 Project Structure

```text
.
├── srv                 → NestJS backend service
│   ├── src/            → Source code (modules, controllers, services)
│   ├── envs/           → Environment configuration files
│   ├── Dockerfile      → Backend container definition
│   └── package.json    → Backend dependencies and scripts
├── ui                  → Angular frontend application
│   ├── src/            → Frontend source code
│   ├── Dockerfile      → Frontend container definition
│   └── package.json    → Frontend dependencies and scripts
├── compat-tests        → OIDC compatibility and integration tests
├── external-user-app   → Mock external application for testing integrations
├── helm                → Kubernetes Helm charts
├── Taskfile.yml        → Task runner configuration for orchestration
└── docker-compose.yml  → Local multi-container setup
```

---

## ✨ Features

* **OIDC & OAuth2**: Support for standard flows including Authorization Code (with PKCE), Client Credentials, and Refresh Token rotation.
* **User Management**: Registration with email verification, password reset, and profile management.
* **Role-Based Access Control**: Permissions powered by **CASL**.
* **Security**: JWT-based authentication, password hashing with Argon2, and CORS protection.
* **Developer Friendly**:
    * Fake SMTP server for local email testing.
    * Comprehensive test suites (Unit, Integration, E2E, OIDC Compatibility).
    * Task runner (`task`) for easy orchestration.
* **Deployment Ready**: Dockerfiles, Helm charts, and CI/CD workflows provided.

---

## ⚙️ Requirements

* [Node.js](https://nodejs.org/) (v18+)
* [npm](https://www.npmjs.com/)
* [Task](https://taskfile.dev/) (optional, but recommended for orchestration)
* [Docker](https://www.docker.com/) & [Docker Compose](https://docs.docker.com/compose/) (for containerized setup)
* [PostgreSQL](https://www.postgresql.org/) (or use the provided Docker setup)

---

## ⚡️ Quick Start

### Using Task (Recommended)

```bash
# 1. Install dependencies for both UI and Server
task build

# 2. Setup environment (copy examples if they don't exist)
# cp srv/envs/.env.example srv/envs/.env.development

# 3. Start both UI and Server concurrently
task serve
```

### Manual Setup

#### Backend (srv)
```bash
cd srv
npm install
# Ensure srv/envs/.env.development exists
npm run start:debug
```

#### Frontend (ui)
```bash
cd ui
npm install
npm run ui:serve
```

---

## 🛠️ Configuration

The backend loads configuration from `.env` files. By default, it looks for `./envs/.env.development`. You can override this using the `ENV_FILE` environment variable.

### Key Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `PORT` | Backend HTTP port | `9000` |
| `NODE_ENV` | Environment mode (`development`/`production`) | `development` |
| `DATABASE_HOST` | PostgreSQL host | `localhost` |
| `ENABLE_FAKE_SMTP_SERVER` | Enable built-in dev SMTP server | `true` |
| `ENABLE_CORS` | Enable CORS protection | `true` |
| `ENABLE_HTTPS` | Enable TLS/HTTPS | `false` |

---

## 🚀 Useful Scripts

### Backend (`srv`)
* `npm run start:debug`: Start with watch mode and debugger.
* `npm run test`: Run Jest tests.
* `npm run typeorm`: Execute TypeORM CLI.
* `npm run generate-migration`: Create a new DB migration.

### Frontend (`ui`)
* `npm run ui:serve`: Start Angular dev server with proxy.
* `npm run test`: Run Karma unit tests.
* `npm run e2e:test`: Run Cypress end-to-end tests.

### Orchestration (`root`)
* `task build`: Build all components.
* `task test`: Run all tests (backend & frontend).
* `task serve`: Run both components in dev mode.

---

## 🧪 Testing

### Backend
```bash
cd srv
npm test
```

### Frontend
```bash
cd ui
npm test          # Unit tests
npm run e2e:test  # Cypress E2E
```

### OIDC Compatibility
```bash
cd compat-tests
npm install
npm test
```

---

## 🐳 Docker & Deployment

### Docker Compose
```bash
docker-compose up --build
```

### Kubernetes (Helm)
```bash
helm upgrade --install auth-server ./helm/auth-server --namespace auth-server --create-namespace
```

---

## 🤝 Contributing

1. Fork the repository.
2. Create your feature branch (`git checkout -b feat/amazing-feature`).
3. Commit your changes.
4. Push to the branch.
5. Open a Pull Request.

---

## © License

Distributed under the [MIT](LICENSE) License. © 2024 Silent Samurai
