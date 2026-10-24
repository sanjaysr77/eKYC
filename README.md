# eKYC Token & Consent Management System

A complete **dual-layer eKYC (electronic Know-Your-Customer)** platform combining Aadhaar-based identity verification with Hyperledger Fabric blockchain for immutable consent and token lifecycle management. The system enables secure, auditable issuance and validation of eKYC tokens with automatic expiration and refresh mechanisms.

## System Overview

This is a **production-grade KYC consent and token management system** with two core layers:

1. **PostgreSQL + Express Backend** - Fast, queryable customer, consent, and token records
2. **Hyperledger Fabric Blockchain** - Immutable audit trail, distributed validation records, multi-org governance

All operations are recorded **dually** in both databases for complete consistency and non-repudiation.

## Project Structure

- **`backend/`** - Express.js TypeScript API server
  - Controllers for consent and token management
  - Services for Aadhaar verification, hashing, token lifecycle, and blockchain integration
  - PostgreSQL database with Prisma ORM
  - Dual-write consistency pattern with Fabric

- **`fabric/`** - Hyperledger Fabric 2.5.x network
  - 3-organization network (Org1, Org2, Org3) with full PKI infrastructure
  - 8-function smart contract for consent and token lifecycle
  - CouchDB state storage (3 instances)
  - Fabric CA certificate authorities (4 servers)
  - Docker Compose orchestration

## Core Features

### Backend API - Dual-Layer Operations

All API operations write to both PostgreSQL and blockchain simultaneously:

#### Consent Management
- **`POST /consent`** - Submit Aadhaar + consent, verify customer, record consent on blockchain
- **`GET /consent/customer/:customerId`** - Retrieve complete consent history (newest first)
- **`POST /consent/withdraw`** - Withdraw consent, creates immutable withdrawal record on blockchain

#### Token Management  
- **`POST /token/issuance`** - Issue 1-hour eKYC token (dual-write to PostgreSQL + blockchain)
- **`POST /token/validate`** - Validate token on blockchain, creates immutable validation record with outcome/reason
- **`POST /token/refresh`** - Create new token from expired token with preserved userRef
- **`POST /token/revoke`** - Revoke active token, prevents further use

### Smart Contract Functions (Blockchain Layer)

8 immutable operations on Hyperledger Fabric ledger:

- **RecordConsent** - Store customer consent with timestamp
- **GetConsent** - Query consent record (read-only)
- **IssueToken** - Create token with userRef, recordHash, and expiration
- **GetToken** - Query token state (read-only)
- **ValidateToken** - Validate token, create immutable ValidationRecord with validating org MSPID
- **ExpireToken** - Mark token as EXPIRED after time passes
- **RefreshToken** - Create new token from expired token
- **WithdrawConsent** - Record consent withdrawal, invalidates dependent tokens

### Key Features

**Security & Cryptography:**
- SHA256 hashing of customer data (userRef) for anonymous blockchain reference
- SHA256 record integrity hashing to detect tampering
- TLS mutual authentication between backend and Fabric peers
- Private key signing of all blockchain transactions

**Audit Trail & Compliance:**
- Every operation recorded immutably on blockchain
- ValidationRecords include validating organization MSPID
- Complete consent history (withdrawal creates new record, not modification)
- Transaction IDs for forensic tracing
- Dual consistency model (PostgreSQL + blockchain both required to succeed)

**Token Lifecycle:**
- 1-hour TTL (time-to-live) for all tokens
- Automatic expiration detection during validation
- Seamless refresh from expired tokens
- Revocation for early termination
- All state changes recorded immutably on blockchain

**Multi-Organization Governance:**
- 3-organization Fabric network enables decentralized validation
- Each organization can validate tokens independently
- MSPID tracking shows which org performed each validation
- Distributed consensus ensures correctness

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Docker & Docker Compose
- PostgreSQL 14+

### Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Set up environment
cp .env.example .env  # Configure DATABASE_URL for your PostgreSQL

# Run migrations
npx prisma migrate dev

# Start API server
npm run dev
```

Backend API runs on `http://localhost:3000`

**Example:** Submit consent
```bash
curl -X POST http://localhost:3000/consent \
  -H "Content-Type: application/json" \
  -d '{
    "aadhaar": "123456789012",
    "consent": "GIVEN"
  }'
```

### Fabric Network Setup

```bash
cd fabric

# Bring up entire network (CA, peers, orderer, CouchDB, channels)
./network.sh all

# Or step by step:
./network.sh up              # Start infrastructure
./network.sh createchannel   # Create kyctokenchannel  
./network.sh deploycc        # Deploy kyc-token-cc chaincode
```

Network endpoints:
- **Peer0.Org1**: localhost:7051 (TLS port 7053)
- **Peer0.Org2**: localhost:9051
- **Peer0.Org3**: localhost:11051
- **Orderer**: localhost:7050
- **CouchDB Org1**: http://localhost:5984/_utils (admin/adminpw)
- **CouchDB Org2**: http://localhost:6984/_utils
- **CouchDB Org3**: http://localhost:7984/_utils

### Verify Setup

```bash
# Check API is running
curl http://localhost:3000/health

# Check network is up
cd fabric && ./invoke.sh query GetConsent consent-123

# Check CouchDB (Org1 peer's state database)
curl http://admin:adminpw@localhost:5984/_all_docs
```

## API Reference

### Consent Endpoints

#### Submit Consent - `POST /consent`
```json
{
  "aadhaar": "123456789012",
  "consent": "GIVEN"
}
```
Returns: 201 with consent record, 400 if Aadhaar verification fails, 409 if customer exists

#### Get Consent Records - `GET /consent/customer/:customerId`
Returns: All consent records for customer (newest first), 404 if none found

#### Withdraw Consent - `POST /consent/withdraw`
```json
{
  "customerId": "uuid"
}
```
Returns: 201 with new WITHDRAWN consent record, blocks future token issuance

### Token Endpoints

#### Issue Token - `POST /token/issuance`
```json
{
  "customerId": "uuid"
}
```
Returns: 201 with token ID and 1-hour expiration timestamp

#### Validate Token - `POST /token/validate`
```json
{
  "tokenId": "uuid"
}
```
Returns: 200 with validation result (valid/invalid, outcome, reason), creates immutable validation record on blockchain

#### Refresh Token - `POST /token/refresh`
```json
{
  "tokenId": "uuid"
}
```
Returns: 201 with new token (only works on EXPIRED tokens)

#### Revoke Token - `POST /token/revoke`
```json
{
  "tokenId": "uuid"
}
```
Returns: 200 on success, prevents further token use

## Backend Architecture

### Request Flow
```
HTTP Request
    ↓
Express Controller (validation)
    ↓
Service Layer (business logic)
    ├→ PostgreSQL (Prisma ORM)
    ├→ Blockchain (via Fabric Gateway)
    └→ Hashing (SHA256)
    ↓
Dual Response (both DB+blockchain succeed or both fail)
    ↓
HTTP Response
```

### Technology Stack

**Backend:**
- Framework: Express.js 5.1.0
- Language: TypeScript 5.8.2
- Database: PostgreSQL 14+
- ORM: Prisma 7.0.0
- Hashing: Node.js native crypto (SHA256)

**Blockchain:**
- Platform: Hyperledger Fabric 2.5.x
- Smart Contracts: TypeScript (Fabric Chaincode SDK)
- Communication: gRPC TLS
- State Storage: CouchDB (3 instances)
- PKI: X.509 certificates + Fabric CA

### Services Layer

**Token Service** (`src/services/tokenService.ts`)
- `expireToken()` - Mark token EXPIRED in both databases
- `refreshToken()` - Create new token from EXPIRED token
- `revokeToken()` - Mark token REVOKED in both databases

**Fabric Service** (`src/services/fabricService.ts`)
- `recordConsentOnFabric()` - Record consent on blockchain
- `issueTokenOnFabric()` - Issue token on blockchain with hashes
- `validateTokenOnFabric()` - Validate and create ValidationRecord
- `expireTokenOnFabric()` - Mark expired on blockchain
- `refreshTokenOnFabric()` - Create new token from expired on blockchain
- `revokeTokenOnFabric()` - Mark revoked on blockchain
- `withdrawConsentOnFabric()` - Record withdrawal on blockchain
- `createGateway()` - Manages Fabric peer connections with TLS

**KYC Hash Service** (`src/services/kycHashService.ts`)
- `createUserRef()` - SHA256(verificationId) for anonymous blockchain ref
- `createRecordHash()` - SHA256(customer record) for integrity

**Aadhaar Verification Service** (`src/services/aadhaarVerificationService.ts`)
- `verifyAadhaar()` - Mock verification (12-digit format, rejects ending in 0)
- Generates unique verificationId with timestamp + random string

### Controllers

**Consent Controller** (`src/controllers/consentController.ts`)
- `submitConsent()` - POST /consent
- `getConsentRecords()` - GET /consent/customer/:customerId
- `withdrawConsent()` - POST /consent/withdraw

**Token Controller** (`src/controllers/tokenController.ts`)
- `tokenIssuance()` - POST /token/issuance
- `validate()` - POST /token/validate
- `refresh()` - POST /token/refresh
- `revoke()` - POST /token/revoke

## Database Schema

### Customer Table
```sql
CREATE TABLE Customer {
  id:              UUID (PK)
  aadhaar:         String (UNIQUE) -- 12-digit Aadhaar number
  verified:        Boolean (default: false)
  verificationId:  String (UNIQUE, nullable)
  createdAt:       DateTime (default: now)
}
```

### Consent Table
```sql
CREATE TABLE Consent {
  id:         UUID (PK)
  customerId: String (FK → Customer.id)
  status:     Enum(GIVEN | WITHDRAWN)
  createdAt:  DateTime (default: now)
}
```

### Token Table
```sql
CREATE TABLE Token {
  id:         UUID (PK)
  customerId: String (FK → Customer.id)
  consentId:  String (FK → Consent.id)
  status:     String (ACTIVE | EXPIRED | REVOKED | Not-Active)
  expiresAt:  DateTime (1-hour from issuance)
  createdAt:  DateTime (default: now)
}
```

**Relationships:**
```
Customer (1) ──→ (many) Consent
Customer (1) ──→ (many) Token
Consent (1) ──→ (many) Token
```

## Hyperledger Fabric Smart Contract

### 8 Core Functions

**kyc-contract.ts** implements complete token and consent lifecycle on blockchain:

1. **RecordConsent(consentId, customerId, status)**
   - Stores consent immutably with timestamp
   - Status must be "GIVEN"

2. **GetConsent(consentId)** [Read-Only]
   - Query consent record from ledger

3. **IssueToken(tokenId, userRef, customerId, consentId, recordHash, expiresAt)**
   - Creates token with full audit metadata
   - Validates consent exists and is GIVEN
   - Prevents duplicate tokens

4. **GetToken(tokenId)** [Read-Only]
   - Query token from ledger

5. **ValidateToken(tokenId)**
   - Validates token status, expiration, consent
   - Creates immutable ValidationRecord with:
     - Outcome (VALID/INVALID)
     - Reason (why invalid)
     - Validating org MSPID
     - Timestamp and transaction ID

6. **ExpireToken(tokenId)**
   - Marks token as EXPIRED after time passes

7. **RefreshToken(oldTokenId, newTokenId, expiresAt)**
   - Creates new token from EXPIRED token
   - Preserves userRef and recordHash

8. **WithdrawConsent(consentId)**
   - Records consent withdrawal
   - Invalidates dependent tokens


## Data Flow Examples

### Example 1: Complete Customer Journey (Consent → Issuance → Validation)

```
1. CUSTOMER REGISTERS & CONSENTS
   POST /consent
   ├→ Verify Aadhaar (12-digit format check)
   ├→ Create Customer (verified=true)
   ├→ Create Consent (status=GIVEN)
   ├→ recordConsentOnFabric() → Immutable consent record
   └→ Return: consentId, customerId

2. CUSTOMER REQUESTS TOKEN
   POST /token/issuance
   ├→ Verify customer exists & verified
   ├→ Get latest GIVEN consent
   ├→ Generate userRef = SHA256(verificationId)
   ├→ Generate recordHash = SHA256(customer record)
   ├→ issueTokenOnFabric(tokenId, userRef, ...)
   ├→ Create token in PostgreSQL (status=ACTIVE, expiresAt=now+1h)
   └→ Return: tokenId, expiresAt

3. THIRD PARTY VALIDATES TOKEN
   POST /token/validate
   ├→ validateTokenOnFabric(tokenId)
   ├→ Blockchain checks:
   │  ├→ Token exists?
   │  ├→ Status = ACTIVE?
   │  ├→ Current time < expiresAt?
   │  └→ Consent status = GIVEN?
   ├→ Create immutable ValidationRecord (outcome, reason, MSPID)
   ├→ If expired: expireToken()
   └→ Return: {valid, outcome, reason, validationId, txId}

4. TOKEN EXPIRES (after 1 hour)
   POST /token/validate
   ├→ validateTokenOnFabric(tokenId)
   ├→ Blockchain returns: outcome=INVALID, reason="Token has expired"
   ├→ expireToken() marks as EXPIRED
   └→ Return: {valid=false, reason="Token has expired"}

5. CUSTOMER REFRESHES TOKEN
   POST /token/refresh
   ├→ Verify old token is EXPIRED
   ├→ Verify consent still GIVEN
   ├→ refreshTokenOnFabric(oldTokenId, newTokenId, newExpiresAt)
   ├→ Create new token in PostgreSQL (status=ACTIVE, expiresAt=now+1h)
   └→ Return: newTokenId, expiresAt

6. CUSTOMER REVOKES TOKEN
   POST /token/revoke
   ├→ Verify token is ACTIVE
   ├→ revokeTokenOnFabric(tokenId) → immutable REVOKED record
   ├→ Mark as REVOKED in PostgreSQL
   └→ Return: success
```

### Example 2: Consent Withdrawal Effect

```
1. CUSTOMER WITHDRAWS CONSENT
   POST /consent/withdraw
   ├→ Get latest consent
   ├→ withdrawConsentOnFabric(consentId) → WITHDRAWN on ledger
   ├→ Create NEW Consent record (status=WITHDRAWN)
   └→ Return: NEW consent record

2. SUBSEQUENT TOKEN ISSUANCE FAILS
   POST /token/issuance
   ├→ Get latest consent
   ├→ Status = WITHDRAWN ✗
   └→ Return 400: "Consent not granted. Token cannot be generated"

3. VALIDATION OF EXISTING TOKENS FAILS
   POST /token/validate
   ├→ validateTokenOnFabric(tokenId)
   ├→ Check linked consent status
   ├→ Consent = WITHDRAWN ✗
   ├→ Create ValidationRecord: outcome=INVALID, reason="Consent is not granted"
   └→ Return: {valid=false, reason="Consent is not granted"}
```

## Development Workflow

### Running Tests

```bash
cd backend

# Run all tests
npm test

# Run specific test
npm test -- tokenController.test.ts

# Watch mode
npm test -- --watch
```

### Building for Production

```bash
cd backend

# Build TypeScript
npm run build

# Run built files
npm start
```

```bash
cd fabric

# Build and deploy chaincode
npm run build
./network.sh deploycc
```

### Debugging

**Backend:**
```bash
# Enable verbose logging
DEBUG=* npm run dev

# VSCode breakpoint debugging
# Launch configuration in .vscode/launch.json
```

**Fabric:**
```bash
# Check peer logs
docker logs fabric-peer0-org1

# Query chaincode state
./invoke.sh query GetToken token-123

# List tokens on CouchDB
curl http://admin:adminpw@localhost:5984/kyctokenchannel/_all_docs
```

## Compliance & Security

**Non-Repudiation:**
- All operations immutably recorded on blockchain
- Validating organization MSPID tracked for each validation
- Transaction IDs link to specific blocks
- Complete audit trail for forensics and compliance

**Data Privacy:**
- Customer identity hidden on blockchain (stored as SHA256 hash)
- Personal data only in PostgreSQL (not exposed to ledger)
- Consent status visible on blockchain for validation

**Token Security:**
- 1-hour expiration prevents indefinite token reuse
- Revocation can terminate early
- Cryptographic hashing ensures data integrity
- TLS mutual authentication between services and Fabric

## Documentation

- **[Complete API Flows](./backend/docs/flows.md)** - Detailed endpoint documentation, service layer, blockchain integration, architecture diagrams
- **[Backend README](./backend/README.md)** - Backend-specific setup and configuration
- **[Fabric Network README](./fabric/README.md)** - Hyperledger Fabric deployment and smart contract guide
- **[Fabric Basics](./fabric/docs/UnderstandingHLF.md)** - Hyperledger Fabric concepts and architecture

## Support & Contributing

For issues, questions, or contributions:
1. Check [API Flows Documentation](./backend/docs/flows.md) for endpoint details
2. Review example curl commands in this README
3. Check Docker logs: `docker logs <container-name>`
4. Query blockchain state directly via CouchDB UI

## License

MIT License - See LICENSE file for details
