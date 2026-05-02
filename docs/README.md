# Auth Server

General-purpose HTTP-based authentication and authorization server. Built with [Node.js](https://nodejs.org/)
and [Nest.js](https://nestjs.com/).

**Features**

- User registration and verification via email.
- Basic authentication using email and password.
- Authorization using [JSON Web Tokens](https://jwt.io/).
- Delete not verified users after the verification token expires.
- Reset password via email.
- Change email address via email.
- API [documentation](https://silentsamurai.github.io/auth-server) available.
- **App-Owned Roles**: Define roles in your app's tenant and have them apply across all subscriber tenants. See `docs/app-owned-roles.md`.
- **Onboarding**: App-initiated tenant provisioning via API (see `docs/multi-tenant-onboarding.md`).
