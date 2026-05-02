# Auth Server

[![Build, Test & Create Docker Image](https://github.com/SilentSamurai/auth-server/actions/workflows/build.yaml/badge.svg)](https://github.com/SilentSamurai/auth-server/actions/workflows/build.yaml)
[![Build & Release Docker Image](https://github.com/SilentSamurai/auth-server/actions/workflows/release.yaml/badge.svg)](https://github.com/SilentSamurai/auth-server/actions/workflows/release.yaml)

A production-ready, OIDC-compatible OAuth Authorization service built
with [NestJS](https://nestjs.com), [Angular](https://angular.io/), and [TypeScript](https://www.typescriptlang.org/).

---

## 🐳 Quick Start with Docker

The easiest way to run Auth Server — no source code needed. The standalone image bundles both the UI and backend API.

**Image:** [`sd25/auth-server`](https://hub.docker.com/repository/docker/sd25/auth-server/general)

### SQLite (zero dependencies)

```bash
docker run -d \
  --name auth-server \
  -p 80:80 \
  -p 9001:9001 \
  -e SUPER_ADMIN_EMAIL=admin@auth.server.com \
  -e SUPER_ADMIN_PASSWORD=changeme \
  -e SUPER_TENANT_DOMAIN=auth.server.com \
  -e ISSUER=http://localhost:9001 \
  sd25/auth-server:latest
```

- UI → [http://localhost](http://localhost)
- API → [http://localhost:9001](http://localhost:9001)

### With PostgreSQL

```bash
docker run -d \
  --name auth-server \
  -p 80:80 \
  -p 9001:9001 \
  -e DATABASE_TYPE=postgres \
  -e DATABASE_HOST=your-db-host \
  -e DATABASE_PORT=5432 \
  -e DATABASE_NAME=auth_db \
  -e DATABASE_USERNAME=dbuser \
  -e DATABASE_PASSWORD=dbpassword \
  -e SUPER_ADMIN_EMAIL=admin@auth.server.com \
  -e SUPER_ADMIN_PASSWORD=changeme \
  -e SUPER_TENANT_DOMAIN=auth.server.com \
  -e ISSUER=https://your-domain.com:9001 \
  sd25/auth-server:latest
```

### Environment Variables

| Variable                        | Purpose                                       | Default                 |
|---------------------------------|-----------------------------------------------|-------------------------|
| `ISSUER`                        | Token issuer URL (must match your public URL) | `http://localhost:9001` |
| `BASE_URL`                      | Public URL of the UI                          | `http://localhost:4200` |
| `BASE_BACKEND_URL`              | Public URL of the backend                     | `http://localhost:9001` |
| `SUPER_ADMIN_EMAIL`             | Initial super-admin email                     | `admin@auth.server.com` |
| `SUPER_ADMIN_PASSWORD`          | Initial super-admin password                  | `admin9000`             |
| `SUPER_TENANT_DOMAIN`           | Domain of the root tenant                     | `auth.server.com`       |
| `DATABASE_TYPE`                 | `sqlite` or `postgres`                        | `sqlite`                |
| `DATABASE_HOST`                 | PostgreSQL host                               | `127.0.0.1`             |
| `DATABASE_PORT`                 | PostgreSQL port                               | `5432`                  |
| `DATABASE_NAME`                 | Database name (or SQLite file path)           | `db/database.sqlite3`   |
| `DATABASE_USERNAME`             | Database user                                 | `root`                  |
| `DATABASE_PASSWORD`             | Database password                             | `root`                  |
| `DATABASE_SSL`                  | Enable SSL for database connection            | `false`                 |
| `MAIL_HOST`                     | SMTP host                                     | `localhost`             |
| `MAIL_PORT`                     | SMTP port                                     | `5870`                  |
| `MAIL_USER`                     | SMTP username                                 | —                       |
| `MAIL_PASSWORD`                 | SMTP password                                 | —                       |
| `TOKEN_EXPIRATION_TIME`         | Access token lifetime                         | `1h`                    |
| `REFRESH_TOKEN_EXPIRATION_TIME` | Refresh token lifetime                        | `7d`                    |
| `PORT`                          | Backend HTTP port                             | `9001`                  |
| `ENABLE_HTTPS`                  | Enable TLS                                    | `false`                 |
| `ENABLE_CORS`                   | Enable CORS protection                        | `true`                  |

> **Note:** Change `SUPER_ADMIN_PASSWORD` before exposing the server publicly. The defaults are for local development only.

---

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

* **OIDC & OAuth2**: Support for standard flows including Authorization Code (with PKCE), Client Credentials, and
  Refresh Token rotation.
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

The backend loads configuration from `.env` files. By default, it looks for `./envs/.env.development`. You can override
this using the `ENV_FILE` environment variable.

### Key Environment Variables

| Variable                  | Purpose                                       | Default       |
|---------------------------|-----------------------------------------------|---------------|
| `PORT`                    | Backend HTTP port                             | `9000`        |
| `NODE_ENV`                | Environment mode (`development`/`production`) | `development` |
| `DATABASE_HOST`           | PostgreSQL host                               | `localhost`   |
| `ENABLE_FAKE_SMTP_SERVER` | Enable built-in dev SMTP server               | `true`        |
| `ENABLE_CORS`             | Enable CORS protection                        | `true`        |
| `ENABLE_HTTPS`            | Enable TLS/HTTPS                              | `false`       |

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

## 🐳 Deployment

### Docker Compose (Build from Source)

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
