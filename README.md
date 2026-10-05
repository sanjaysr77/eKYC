# eKYC v1.0

Complete eKYC platform combining identity verification backend with Hyperledger Fabric blockchain infrastructure for immutable KYC record management.

## Project Structure

- **`backend/`** - TypeScript/Node.js API server (Aadhaar verification, consent management, token issuance)
- **`fabric/`** - Hyperledger Fabric 2.5.x network (3-org setup, KYC token chaincode)
- **`eKYC/`** - Legacy/alternative implementation folder (mirrors fabric setup)

## Core Features

### Backend API
- **Aadhaar Verification** - Mock verification service with format validation (12-digit strings)
- **Consent Management** - Submit, retrieve, and track consent records with enum statuses (GIVEN/WITHDRAWN)
- **Token Issuance** - Generate 1-hour expiring access tokens linked to verified customers and consent
- **Token Validation** - Validate token status, expiration, and linked consent on blockchain
- **Token Refresh** - Create new tokens from expired tokens while maintaining customer context
- **Token Revocation** - Revoke active tokens to prevent further use
- **Dual-Layer Recording** - All operations recorded in PostgreSQL and Hyperledger Fabric simultaneously

### Fabric Blockchain
- **7 Blockchain Functions** - RecordConsent, GetConsent, IssueToken, GetToken, ValidateToken, ExpireToken, RefreshToken
- **Distributed KYC Records** - Store verified KYC tokens on immutable ledger
- **3-Organization Network** - Org1, Org2, Org3 with full PKI and Fabric CA servers
- **Validation Recording** - Each token validation creates immutable validation record with outcome and reason
- **Cryptographic Integrity** - SHA256 hashing for user references and record integrity
- **Cross-Org Audit Trail** - Tracks MSPID of validating organizations in blockchain records

## Quick Start

### Backend

```bash
cd backend
npm install
npm run dev
```

API runs on `http://localhost:3000`

### Fabric Network

```bash
cd fabric
./network.sh all
```

Network ready on `http://localhost:7984` (CouchDB UI)

## API Endpoints

### Consent Management
- `POST /consent` - Submit Aadhaar + consent, creates/updates customer, records on blockchain
- `GET /consent/customer/:customerId` - Retrieve all consent records (newest first)

### Token Management
- `POST /token/issuance` - Issue 1-hour token for verified customer with valid consent
- `POST /token/validate` - Validate token status, expiration, and consent on blockchain
- `POST /token/refresh` - Create new token from expired one; preserves customer context
- `POST /token/revoke` - Revoke active token to prevent further use

## Architecture

### Backend Stack
- **Framework** - Express.js
- **Language** - TypeScript
- **Database** - PostgreSQL + Prisma ORM
- **Layers** - Controllers → Services → Database

### Fabric Stack
- **Orderer** - orderer.example.com
- **Peers** - 3 peers (Org1, Org2, Org3)
- **Chaincode** - Node.js KYC token contract
- **State DB** - CouchDB (3 instances)
- **CA** - Fabric CA (4 servers)

## Database Schema (Backend)

### Customer
- `id` (UUID, Primary Key)
- `aadhaar` (12-digit unique identifier)
- `verified` (boolean, default: false)
- `verificationId` (unique reference from verification service)
- `createdAt` (timestamp)

### Consent
- `id` (UUID, Primary Key)
- `customerId` (Foreign Key → Customer.id)
- `status` (enum: GIVEN | WITHDRAWN)
- `createdAt` (timestamp)

### Token
- `id` (UUID, Primary Key)
- `customerId` (Foreign Key → Customer.id)
- `consentId` (Foreign Key → Consent.id)
- `status` (enum: ACTIVE | EXPIRED | REVOKED | Not-Active)
- `expiresAt` (timestamp, 1-hour default from issuance)
- `createdAt` (timestamp)

**Relationships:**
```
Customer (1) → (many) Consent
Customer (1) → (many) Token
Consent (1) → (many) Token
```

Each token links to a specific consent record for complete audit trail.

## Backend Services Layer

### Token Service (tokenService.ts)
- **expireToken()** - Marks token as EXPIRED in database and blockchain
- **refreshToken()** - Creates new token from expired one, validates consent

### Fabric Service (fabricService.ts)
- **recordConsentOnFabric()** - Records consent on blockchain
- **issueTokenOnFabric()** - Issues token on blockchain with hash and userRef
- **validateTokenOnFabric()** - Validates token and creates immutable validation record
- **expireTokenOnFabric()** - Marks token expired on blockchain
- **refreshTokenOnFabric()** - Creates new token from expired on blockchain
- **createGateway()** - Manages Fabric peer connections with TLS certificate auth

### Aadhaar Verification Service (aadhaarVerificationService.ts)
- **verifyAadhaar()** - Mock verification (validates 12-digit format, rejects if ending in 0)
- Generates unique verification IDs with timestamp + random string

### KYC Hash Service (kycHashService.ts)
- **createUserRef()** - SHA256 hash of verification ID (for blockchain userRef)
- **createRecordHash()** - SHA256 hash of customer record (for integrity tracking)

## Access Points

- **Backend API**: http://localhost:3000
- **CouchDB (Org1)**: http://localhost:7984/_utils (admin/adminpw)
- **CouchDB (Org2)**: http://localhost:8984/_utils
- **CouchDB (Org3)**: http://localhost:9984/_utils

## Fabric Commands

```bash
cd fabric

# Full deployment
./network.sh all

# Individual steps
./network.sh up              # Start infrastructure
./network.sh createchannel   # Create kycTokenChannel
./network.sh deploycc        # Deploy chaincode

# Management
./network.sh stop            # Pause (preserves state)
./network.sh start           # Resume
./network.sh down            # Stop and cleanup
./network.sh cleanall        # Complete reset
```

## Future Roadmap

- **Scheduled Jobs** - Auto token cleanup, consent expiry
- **Rate Limiting & RBAC** - Request throttling, role-based access
- **Enhanced Audit Logs** - Compliance-ready forensic logging
- **Multi-tenant Support** - Support multiple organizations
- **API Gateway** - Authentication, authorization layer
- **Consent Withdrawal** - Handle consent revocation and token invalidation

## Documentation

- [Backend Flows](./backend/docs/flows.md) - API endpoint flows and lifecycle
- [Fabric Setup](./fabric/README.md) - Network deployment and chaincode
- [Fabric Docs](./fabric/docs/UnderstandingHLF.md) - Hyperledger Fabric basics
