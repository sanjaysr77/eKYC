# eKYC v1.0

Complete eKYC platform combining identity verification backend with Hyperledger Fabric blockchain infrastructure for immutable KYC record management.

## Project Structure

- **`backend/`** - TypeScript/Node.js API server (Aadhaar verification, consent management, token issuance)
- **`fabric/`** - Hyperledger Fabric 2.5.x network (3-org setup, KYC token chaincode)
- **`eKYC/`** - Legacy/alternative implementation folder (mirrors fabric setup)

## Core Features

### Backend API
- **Aadhaar Verification** - Verify customer identity via Aadhaar service
- **Consent Management** - Track and manage consent records with audit trail
- **Token Issuance** - Generate time-limited access tokens linked to verified consent
- **Customer Lifecycle** - Onboard, verify, and manage customer records

### Fabric Blockchain
- **Distributed KYC Records** - Store verified KYC tokens on Hyperledger Fabric
- **3-Organization Network** - Org1, Org2, Org3 with full PKI
- **Immutable Audit Trail** - Blockchain-backed record of all KYC transactions
- **Smart Contracts** - RecordConsent, GetConsent functions

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

### Consent
- `POST /consent` - Submit Aadhaar + consent, triggers verification
- `GET /consent/customer/:customerId` - Retrieve consent history

### Token
- `POST /token` - Issue or retrieve active token for verified customer

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

```
Customer (1) → (many) Consent
Customer (1) → (many) Token
Consent (1) → (many) Token
```

Each token links to a specific consent record for audit trail.

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

- **Token Lifecycle** - ValidateToken, RefreshToken, RevokeToken
- **Scheduled Jobs** - Auto token cleanup, consent expiry
- **Rate Limiting & RBAC** - Request throttling, role-based access
- **Enhanced Audit Logs** - Compliance-ready forensic logging
- **Multi-tenant Support** - Support multiple organizations
- **API Gateway** - Authentication, authorization layer

## Documentation

- [Backend Flows](./backend/docs/flows.md) - API endpoint flows and lifecycle
- [Fabric Setup](./fabric/README.md) - Network deployment and chaincode
- [Fabric Docs](./fabric/docs/UnderstandingHLF.md) - Hyperledger Fabric basics
