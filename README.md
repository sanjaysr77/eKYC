# eKYC v1.0

Identity verification backend built with TypeScript, Node.js, Prisma, and PostgreSQL.

## Core Features

- **Aadhaar Verification** - Verify customer identity via Aadhaar verification service
- **Consent Management** - Track and manage customer consent records with full audit trail
- **Token Issuance** - Generate time-limited access tokens linked to verified consent
- **Customer Lifecycle** - Onboard, verify, and manage customer records

## API Endpoints

### Consent
- `POST /consent` - Submit Aadhaar + consent, triggers verification
- `GET /consent/customer/:customerId` - Retrieve consent history (newest first)

### Token
- `POST /token` - Issue or retrieve active token for verified customer

## Architecture

Built in layers:
- **Controllers** - Request handling and response formatting
- **Services** - Business logic (Aadhaar verification)
- **Database** - Prisma ORM with PostgreSQL
- **Models** - Customer, Consent, Token with relational audit trails

## Database Schema

```
Customer (1) → (many) Consent
Customer (1) → (many) Token
Consent (1) → (many) Token
```

Each token is linked to a specific consent record, creating an immutable audit trail.

## Future Roadmap

- **Token Lifecycle Management** - ValidateToken, RefreshToken, RevokeToken endpoints
- **Scheduled Jobs** - Automatic expired token cleanup, consent expiry management
- **Hyperledger Integration** - Anchor KYC records on Hyperledger Fabric for cross-institutional auditability
- **Rate Limiting & RBAC** - Implement request rate limiting and role-based access control
- **Audit Logs** - Comprehensive logging for compliance and forensic analysis

## Documentation

See [flows.md](./backend/docs/flows.md) for detailed endpoint flows and lifecycle documentation.
