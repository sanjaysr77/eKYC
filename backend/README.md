# Backend API - eKYC Token & Consent Management

Express.js + TypeScript backend providing REST API for customer verification, consent management, and eKYC token lifecycle. All operations are dual-written to PostgreSQL and Hyperledger Fabric blockchain for consistency and immutable audit trail.

## Features

### Aadhaar-Based Verification
- Mock Aadhaar verification service (12-digit format validation)
- Generates unique verification IDs with timestamp + random string
- Production integration point for UIDAI Aadhaar API

### Consent Management
- Submit consent linked to Aadhaar verification
- Retrieve complete consent history (newest first)
- Withdraw consent (creates new immutable record, preserves audit trail)
- Enum-based status (GIVEN | WITHDRAWN) for type safety

### Token Lifecycle Management
- **Issue**: Generate 1-hour eKYC tokens with cryptographic hashing
- **Validate**: Check token status, expiration, and consent on blockchain (creates immutable validation record)
- **Refresh**: Create new token from expired token
- **Revoke**: Early termination of active tokens

### Dual-Write Consistency
- All operations written to PostgreSQL (queryable, indexed) AND Hyperledger Fabric blockchain (immutable, auditable)
- Both databases must succeed for transaction to succeed
- Blockchain is source of truth for audit trail

### Security & Cryptography
- SHA256 hashing of customer data for anonymous blockchain reference (userRef)
- SHA256 record integrity hashing to detect tampering
- TLS mutual authentication with Fabric peers
- Private key signing of all blockchain transactions

## Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Hyperledger Fabric network running (or mock mode)

### Installation

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env

# Set DATABASE_URL in .env for your PostgreSQL
DATABASE_URL="postgresql://user:password@localhost:5432/ekycdb"

# Run database migrations
npx prisma migrate dev

# Generate Prisma client
npx prisma generate

# Start development server
npm run dev
```

Server runs on `http://localhost:3000`

### Production Build

```bash
# Build TypeScript
npm run build

# Run production server
npm start

# Or with environment
NODE_ENV=production npm start
```

## Project Structure

```
backend/
├── src/
│   ├── controllers/          # REST endpoint handlers
│   │   ├── consentController.ts
│   │   └── tokenController.ts
│   ├── services/             # Business logic
│   │   ├── tokenService.ts
│   │   ├── aadhaarVerificationService.ts
│   │   ├── kycHashService.ts
│   │   └── fabricService.ts
│   ├── index.ts              # Express app setup
│   └── routes/               # Route definitions
├── prisma/
│   ├── schema.prisma         # Database schema
│   └── migrations/           # Database migration history
├── dist/                     # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
└── README.md
```

## API Endpoints

### Consent Management

#### POST /consent
Submit Aadhaar and consent, creates customer if new, records on blockchain.

**Request:**
```json
{
  "aadhaar": "123456789012",
  "consent": "GIVEN"
}
```

**Response (201):**
```json
{
  "consent": {
    "id": "uuid",
    "customerId": "uuid",
    "status": "GIVEN",
    "createdAt": "2026-10-12T10:30:00Z"
  }
}
```

**Errors:**
- 400: Invalid Aadhaar format or verification failed
- 409: Customer already exists
- 500: Server error

---

#### GET /consent/customer/:customerId
Retrieve all consent records for a customer (newest first).

**Response (200):**
```json
{
  "customerId": "uuid",
  "consentRecords": [
    {
      "id": "uuid",
      "customerId": "uuid",
      "status": "GIVEN",
      "createdAt": "2026-10-12T10:30:00Z"
    }
  ]
}
```

**Errors:**
- 400: Invalid customer ID
- 404: No consent records found
- 500: Server error

---

#### POST /consent/withdraw
Withdraw (revoke) customer consent. Creates new WITHDRAWN record.

**Request:**
```json
{
  "customerId": "uuid"
}
```

**Response (201):**
```json
{
  "message": "Consent for Customer ID uuid is WITHDRAWN",
  "consent": {
    "id": "uuid-new",
    "customerId": "uuid",
    "status": "WITHDRAWN",
    "createdAt": "2026-10-12T10:35:00Z"
  }
}
```

**Errors:**
- 400: Invalid customerId or customer not verified
- 404: Customer or consent not found
- 409: Consent already withdrawn
- 500: Server error

### Token Management

#### POST /token/issuance
Issue 1-hour eKYC token for verified customer with GIVEN consent.

**Request:**
```json
{
  "customerId": "uuid"
}
```

**Response (201):**
```json
{
  "message": "Token issued successfully.",
  "token": "uuid",
  "expiresAt": "2026-10-12T11:30:00Z"
}
```

**Errors:**
- 400: Validation failed (customer not verified, no GIVEN consent, token exists)
- 404: Customer not found
- 500: Server error

---

#### POST /token/validate
Validate token status, expiration, and consent on blockchain.

**Request:**
```json
{
  "tokenId": "uuid"
}
```

**Response (200):**
```json
{
  "message": "Token is valid",
  "validation": {
    "valid": true,
    "tokenId": "uuid",
    "userRef": "sha256hash",
    "status": "ACTIVE",
    "expiresAt": "2026-10-12T11:30:00Z",
    "validationId": "uuid",
    "validationTxId": "blockchain-tx-id",
    "outcome": "VALID",
    "reason": ""
  }
}
```

**Errors:**
- 400: Missing tokenId
- 404: Token not found
- 500: Server error

---

#### POST /token/refresh
Create new token from expired token (extends validity).

**Request:**
```json
{
  "tokenId": "uuid"
}
```

**Response (201):**
```json
{
  "message": "New token issued successfully.",
  "token": "uuid",
  "expiresAt": "2026-10-12T12:30:00Z"
}
```

**Errors:**
- 400: Token not EXPIRED or consent not GIVEN
- 404: Token or consent not found
- 500: Server error

---

#### POST /token/revoke
Revoke active token to prevent further use.

**Request:**
```json
{
  "tokenId": "uuid"
}
```

**Response (200):**
```json
{
  "message": "Token Revoked Successfully",
  "tokenId": "uuid"
}
```

**Errors:**
- 400: Missing tokenId or token not ACTIVE
- 404: Token not found
- 500: Server error

## Database Schema

### Customer
```prisma
model Customer {
  id              String     @id @default(uuid())
  aadhaar         String     @unique
  verified        Boolean    @default(false)
  verificationId  String?    @unique
  createdAt       DateTime   @default(now())

  consents Consent[]
  tokens   Token[]
}
```

**Fields:**
- `id`: Unique identifier (UUID)
- `aadhaar`: 12-digit Aadhaar number (unique)
- `verified`: True after successful Aadhaar verification
- `verificationId`: Reference from verification service
- `createdAt`: Registration timestamp

---

### Consent
```prisma
model Consent {
  id         String      @id @default(uuid())
  customerId String
  status     ConsentStatus
  createdAt  DateTime    @default(now())

  customer   Customer    @relation(fields: [customerId], references: [id])
  tokens   Token[]
}

enum ConsentStatus {
  GIVEN
  WITHDRAWN
}
```

**Fields:**
- `id`: Unique identifier (UUID)
- `customerId`: Foreign key to Customer
- `status`: Enum (GIVEN or WITHDRAWN)
- `createdAt`: When consent was recorded

**Important:** Status is immutable. Withdrawal creates NEW record with WITHDRAWN status, preserving audit history.

---

### Token
```prisma
model Token {
  id         String      @id @default(uuid())
  customerId String
  consentId  String
  status     String      @default("Not-Active")
  createdAt  DateTime    @default(now())
  expiresAt  DateTime

  customer   Customer    @relation(fields:[customerId], references: [id])
  consent    Consent     @relation(fields:[consentId], references: [id])
}
```

**Fields:**
- `id`: Unique token identifier (UUID)
- `customerId`: Foreign key to Customer
- `consentId`: Foreign key to Consent (token tied to specific consent)
- `status`: String (ACTIVE, EXPIRED, REVOKED, Not-Active)
- `expiresAt`: 1-hour expiration timestamp
- `createdAt`: Token issuance timestamp

**Relationships:**
```
Customer (1) ──→ (many) Consent
Customer (1) ──→ (many) Token
Consent (1) ──→ (many) Token
```

## Services

### Token Service (src/services/tokenService.ts)

#### expireToken(tokenId: string)
Mark token as EXPIRED in both PostgreSQL and blockchain.

**Validation:**
- Token must exist
- Token status must be ACTIVE
- Current time must be past expiresAt

**Operations:**
1. Find token in PostgreSQL
2. Validate time has passed
3. Call expireTokenOnFabric(tokenId)
4. Update token status to EXPIRED

---

#### refreshToken(tokenId: string): Token
Create new ACTIVE token from EXPIRED token.

**Validation:**
- Token must be EXPIRED
- Linked consent must be GIVEN

**Operations:**
1. Find old token
2. Verify EXPIRED status
3. Get linked consent
4. Generate new tokenId (UUID)
5. Calculate expiresAt = now + 1 hour
6. Call refreshTokenOnFabric(oldTokenId, newTokenId, expiresAt)
7. Create new token in PostgreSQL
8. Return new token

---

#### revokeToken(tokenId: string): Token
Revoke ACTIVE token, mark as REVOKED in both databases.

**Validation:**
- Token must be ACTIVE

**Operations:**
1. Find token
2. Verify ACTIVE status
3. Call revokeTokenOnFabric(tokenId)
4. Update token status to REVOKED
5. Return updated token

### KYC Hash Service (src/services/kycHashService.ts)

#### createUserRef(verificationId: string): string
Create SHA256 hash of verification ID for anonymous blockchain reference.

**Process:**
1. Hash verificationId with SHA256
2. Return 64-character hex string

**Purpose:** Prevents customer identification on public blockchain ledger

---

#### createRecordHash(record: {verificationId, verified, createdAt}): string
Create SHA256 hash of customer verification record for integrity verification.

**Process:**
1. Canonicalize record to JSON
2. Hash with SHA256
3. Return 64-character hex string

**Purpose:** Detects tampering with customer record, links token to original verification state

### Aadhaar Verification Service (src/services/aadhaarVerificationService.ts)

#### verifyAadhaar(aadhaar: string): AadhaarVerificationResponse

Mock Aadhaar verification for development/testing.

**Validation:**
- Must be 12 digits: `/^\d{12}$/`
- Mock rule: Numbers ending in '0' are rejected

**Returns:**
```typescript
{
  verified: boolean,              // true/false
  verificationId: string,         // "VERIFY_{timestamp}_{random}"
  aadhaar: string,               // Echo of input
  timestamp: string,             // ISO8601
  message: string                // "...successfully" or "...failed"
}
```

**Note:** For production, replace with actual UIDAI Aadhaar verification API.

### Fabric Service (src/services/fabricService.ts)

Bidirectional integration with Hyperledger Fabric blockchain via TypeScript SDK.

#### recordConsentOnFabric(consentId, customerId)
Records consent on blockchain (calls RecordConsent smart contract).

#### issueTokenOnFabric(tokenId, userRef, customerId, consentId, recordHash, expiresAt)
Issues token on blockchain with full metadata (calls IssueToken smart contract).

#### validateTokenOnFabric(tokenId)
Validates token on blockchain, creates immutable validation record (calls ValidateToken smart contract).

#### expireTokenOnFabric(tokenId)
Marks token as EXPIRED on blockchain (calls ExpireToken smart contract).

#### refreshTokenOnFabric(oldTokenId, newTokenId, expiresAt)
Creates new token from expired token on blockchain (calls RefreshToken smart contract).

#### revokeTokenOnFabric(tokenId)
Revokes token on blockchain (calls RevokeToken smart contract).

#### withdrawConsentOnFabric(consentId)
Records consent withdrawal on blockchain (calls WithdrawConsent smart contract).

#### createGateway()
Manages Fabric peer connections with TLS certificate authentication.

**Configuration:**
- Channel: kyctokenchannel
- Chaincode: kyc-token-cc
- MSP ID: Org1MSP
- Peer: localhost:7051
- TLS: Mutual authentication with X.509 certificates

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:password@host:5432/ekycdb

# Server
NODE_ENV=development|production
PORT=3000

# Fabric (optional if using mock mode)
FABRIC_NETWORK_PATH=../fabric
FABRIC_MSP_ID=Org1MSP
```

## Development

### Running Tests

```bash
# All tests
npm test

# Specific test file
npm test -- tokenController.test.ts

# Watch mode
npm test -- --watch

# With coverage
npm test -- --coverage
```

### Building

```bash
# TypeScript compilation
npm run build

# Watch compilation
npm run build -- --watch
```

### Linting

```bash
# Check code
npm run lint

# Fix issues
npm run lint -- --fix
```

## Database Migrations

```bash
# Create new migration
npx prisma migrate dev --name migration_name

# Apply migrations
npx prisma migrate deploy

# Reset database (dev only)
npx prisma migrate reset

# View migrations
npx prisma migrate status
```

## Troubleshooting

**Fabric Connection Error:**
```
Check that Fabric network is running and peer is accessible at localhost:7051
Verify TLS certificates in fabric/organizations/
```

**Database Connection Error:**
```
Verify DATABASE_URL is correct
Check PostgreSQL is running: psql -U user -d ekycdb -h localhost
```

**Token Validation Fails:**
```
Ensure blockchain network is running
Check that token exists in PostgreSQL
Query token on blockchain: ./fabric/invoke.sh query GetToken token-uuid
```

## Performance Notes

- Token issuance: ~15 seconds (blockchain consensus)
- Token validation: ~15 seconds (blockchain endorsement + validation record creation)
- Validation queries: ~5 seconds (peer evaluation)
- PostgreSQL queries: <100ms (indexed lookups)

## License

MIT License
