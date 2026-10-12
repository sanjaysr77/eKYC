# eKYC Token & Consent Lifecycle Documentation

## Table of Contents
1. [System Architecture Overview](#system-architecture-overview)
2. [API Endpoints](#api-endpoints)
3. [Consent Management](#consent-management)
4. [Token Management](#token-management)
5. [Blockchain Integration](#blockchain-integration)
6. [Data Models & Schema](#data-models--schema)
7. [Service Layer Functions](#service-layer-functions)
8. [Complete Flows](#complete-flows)
9. [Security & Audit Trail](#security--audit-trail)

---

## System Architecture Overview

The eKYC system is a dual-layer architecture combining:
- **Backend Layer**: Express.js + TypeScript + PostgreSQL (via Prisma ORM)
- **Blockchain Layer**: Hyperledger Fabric 2.5.x with 3-organization network + CouchDB state store
- **Integration Pattern**: Bidirectional dual-write sync between PostgreSQL and Fabric ledger

### Component Architecture
```
┌────────────────────────────────────────────────┐
│         Express.js REST API Server              │
│  Consent Controller  │  Token Controller        │
└────────────────────────────────────────────────┘
            ↓ (calls services) ↓
┌────────────────────────────────────────────────┐
│           Service Layer                         │
│  Token  │  Consent  │  Aadhaar  │  Fabric      │
│ Service │ Service   │ Verify    │  Service     │
└────────────────────────────────────────────────┘
    ↓ (reads/writes)        ↓ (blockchain calls)
┌─────────────┐         ┌──────────────────┐
│  PostgreSQL │         │ Hyperledger      │
│  (Customers,│         │ Fabric Network   │
│  Consents,  │         │ (Chaincode: 8    │
│  Tokens)    │         │  smart contract  │
└─────────────┘         │  functions)      │
                        └──────────────────┘
```

---

## API Endpoints

### Consent Management
- `POST /consent` - Submit Aadhaar and consent for verification
- `GET /consent/customer/:customerId` - Retrieve consent records for a customer
- `POST /consent/withdraw` - Withdraw customer consent

### Token Management
- `POST /token/issuance` - Issue new or retrieve active 1-hour token
- `POST /token/validate` - Validate token status and create immutable audit record
- `POST /token/refresh` - Create new token from expired token
- `POST /token/revoke` - Revoke an active token

---

## Consent Management

### Consent Status Enum

The Consent model uses an enum for status with two valid values:

**Valid Values:**
- `GIVEN` - Consent has been granted by customer
- `WITHDRAWN` - Consent has been revoked/withdrawn by customer

This ensures type safety and prevents invalid status values.

### Consent Lifecycle
```
Customer Registration
    ↓
GIVEN (initial submission)
    ├→ Customer can request tokens
    ├→ Tokens can be validated
    └→ Tokens can be refreshed
    ↓
WITHDRAWN (customer revokes)
    └→ No new tokens can be issued
    └→ Token validation returns invalid
    └→ Refresh blocked
```

**Important:** Consent withdrawal creates a NEW Consent record with status=WITHDRAWN, rather than modifying the original GIVEN record. This preserves complete audit history.

---

## Token Management

### Token Status Values

The Token model supports multiple status states throughout its lifecycle:

**Valid Token Statuses:**
- `ACTIVE` - Token is valid and can be used (default when newly created, 1-hour TTL)
- `EXPIRED` - Token's expiration time has passed (auto-marked during validation)
- `REVOKED` - Token has been explicitly revoked by user/system
- `Not-Active` - Legacy status (initial default, rarely used)

**Status Transitions:**
```
ACTIVE → EXPIRED (automatic, when expiresAt <= current_time during validation)
ACTIVE → REVOKED (manual, via POST /token/revoke endpoint)
EXPIRED → ACTIVE (via token refresh)
```

---

## Complete Flows

### 1. Customer Verification & Consent Submission

#### POST /consent

Customer submits Aadhaar and consent. System verifies Aadhaar, creates or finds customer, and records consent on both PostgreSQL and Hyperledger Fabric.

**Request Body:**
```json
{
  "aadhaar": "123456789012",
  "consent": "GIVEN"
}
```

**Flow:**
1. Receive Aadhaar (12-digit string) + consent value
2. Validate Aadhaar format (regex: 12 digits only)
3. Validate consent value is "GIVEN"
4. Call `verifyAadhaar()` service
   - Format validation: 12 digits
   - Mock rule: Numbers ending in '0' are rejected
   - Returns: {verified, verificationId, message}
5. If verification fails → return 400 error
6. Check if customer exists (by Aadhaar)
7. If new customer:
   - Create customer record with verified=true, verificationId
8. If existing customer:
   - Return 409 conflict error
9. Create consent record with status="GIVEN", link to customer
10. Call `recordConsentOnFabric(consentId, customerId)` for immutable ledger record
11. Return 201 with consent record

**Response (201) - Success:**
```json
{
  "consent": {
    "id": "uuid",
    "customerId": "uuid",
    "status": "GIVEN",
    "createdAt": "ISO8601-timestamp"
  }
}
```

**Error Responses:**
```json
{
  "message": "A valid 12-digit Aadhaar value is required."
}
```
```json
{
  "error": "Aadhaar verification failed",
  "message": "Aadhaar verification failed",
  "verificationId": "VERIFY_..."
}
```
```json
{
  "message": "Customer already exists."
}
```

**Status Codes:**
- 201: Consent created successfully
- 400: Aadhaar verification failed or invalid format
- 409: Customer already exists
- 500: Server error

---

### 2. Consent Retrieval

### GET /consent/customer/:customerId

#### GET /consent/customer/:customerId

Retrieve all consent records for a customer, newest first.

**URL Parameters:**
- `customerId` - Customer UUID

**Flow:**
1. Receive customerId from URL params
2. Validate customerId is provided and is a string
3. Query all consent records for that customer from PostgreSQL
4. Sort by createdAt descending (newest → oldest)
5. Return array of consent records

**Response (200) - Success:**
```json
{
  "customerId": "uuid",
  "consentRecords": [
    {
      "id": "uuid",
      "customerId": "uuid",
      "status": "GIVEN",
      "createdAt": "ISO8601-timestamp"
    },
    {
      "id": "uuid-2",
      "customerId": "uuid",
      "status": "WITHDRAWN",
      "createdAt": "ISO8601-timestamp"
    }
  ]
}
```

**Note:** Status field uses enum values (`GIVEN` or `WITHDRAWN`). Complete history shows all consent state changes.

**Error Responses:**
```json
{
  "message": "Invalid customer ID."
}
```
```json
{
  "message": "No consent records found."
}
```

**Status Codes:**
- 200: Consent records retrieved successfully
- 400: Invalid customer ID
- 404: No consent records found
- 500: Server error

---

### 3. Consent Withdrawal

#### POST /consent/withdraw

Withdraw (revoke) customer consent. Creates new WITHDRAWN consent record while preserving audit trail.

**Request Body:**
```json
{
  "customerId": "uuid"
}
```

**Flow:**
1. Receive customerId from request body
2. Validate customerId is string and not empty
3. Find customer and verify it exists
4. Verify customer is verified (verified=true)
5. Get latest consent record (ordered by createdAt desc, take 1)
6. Check if latest consent is already WITHDRAWN
7. Call `withdrawConsentOnFabric(consentId)` to record on blockchain
   - Updates consent status to WITHDRAWN on immutable ledger
8. Create NEW Consent record with status="WITHDRAWN"
   - Original "GIVEN" record preserved for audit
9. Return 201 with new withdrawn consent record

**Response (201) - Success:**
```json
{
  "message": "Consent for Customer ID uuid is WITHDRAWN",
  "consent": {
    "id": "uuid-new",
    "customerId": "uuid",
    "status": "WITHDRAWN",
    "createdAt": "ISO8601-timestamp"
  }
}
```

**Error Responses:**
```json
{
  "message": "A valid customer ID is required."
}
```
```json
{
  "message": "Customer is not found"
}
```
```json
{
  "message": "Customer is not verified"
}
```
```json
{
  "message": "No consent record found"
}
```
```json
{
  "message": "Consent is already WITHDRAWN",
  "consent": "WITHDRAWN"
}
```

**Status Codes:**
- 201: Consent withdrawn successfully
- 400: Invalid customerId or customer not verified
- 404: Customer or consent not found
- 409: Consent already withdrawn
- 500: Server error

**Side Effects After Withdrawal:**
- New token issuance blocked (requires GIVEN consent)
- Token validation returns INVALID
- Token refresh blocked

---

### 4. Token Issuance

#### POST /token/issuance

Issue a new 1-hour eKYC token for a customer. Validates customer verification and consent, creates hashes, and writes to both PostgreSQL and blockchain.

**Request Body:**
```json
{
  "customerId": "uuid"
}
```

**Flow:**
1. Receive customerId from request body
2. Validate customerId is provided
3. Find customer with latest consent (ordered by createdAt desc, take 1)
4. Verify customer exists
5. Verify customer is verified (verified=true and verificationId present)
6. Extract latest consent record
7. Verify latest consent status = "GIVEN"
8. Query for existing ACTIVE token for this customer
9. If ACTIVE token exists → return 400 error (no duplicate active tokens)
10. If no ACTIVE token:
    - Generate userRef = SHA256(verificationId) - anonymous customer hash
    - Generate recordHash = SHA256({verificationId, verified, createdAt}) - data integrity
    - Generate new UUID for tokenId
    - Calculate expiresAt = current_time + 1 hour
    - Call `issueTokenOnFabric()` to record on blockchain
    - Create token in PostgreSQL with status="ACTIVE", expiresAt
11. Return 201 with token ID and expiration time

**Response (201) - New Token:**
```json
{
  "message": "Token issued successfully.",
  "token": "uuid",
  "expiresAt": "ISO8601-timestamp"
}
```

**Error Responses:**
```json
{
  "message": "Customer Id is not present"
}
```
```json
{
  "message": "Customer is not found"
}
```
```json
{
  "message": "Customer is not verified"
}
```
```json
{
  "message": "Customer verification ID is missing"
}
```
```json
{
  "message": "Consent not granted. Token cannot be generated"
}
```
```json
{
  "message": "Token Already Exists. Try Refreshing",
  "token": {existing_token_object}
}
```

**Status Codes:**
- 201: Token issued successfully
- 400: Validation failed (missing customerId, not verified, no consent, or token exists)
- 404: Customer not found
- 500: Server error

**Token Details:**
- Validity: 1 hour from issuance
- Status: ACTIVE
- Stored in: Both PostgreSQL and Hyperledger Fabric ledger
- Contains: tokenId, userRef, customerId, consentId, recordHash, expiresAt

---

### 5. Token Validation

#### POST /token/validate

Validate if a token is active and not expired. Calls blockchain to create immutable validation record. Automatically marks expired tokens.

**Request Body:**
```json
{
  "tokenId": "uuid"
}
```

**Flow:**
1. Receive tokenId from request body
2. Validate tokenId is provided
3. Find token in PostgreSQL
4. Verify token exists
5. Call `validateTokenOnFabric(tokenId)` for blockchain validation
   - Blockchain checks:
     - Token exists in ledger
     - Token status = "ACTIVE"
     - expiresAt > current_time
     - Linked consent status = "GIVEN"
   - Creates immutable ValidationRecord on ledger with:
     - validationId (UUID)
     - outcome (VALID or INVALID)
     - reason (why it's invalid, if applicable)
     - validatingOrg MSPID (which org performed validation)
     - timestamp and transaction ID
6. Parse validation result
7. If outcome="INVALID" AND reason="Token has expired":
   - Call `expireToken()` to mark as EXPIRED in PostgreSQL
8. Return 200 with validation details

**Response (200) - Valid Token:**
```json
{
  "message": "Token is valid",
  "validation": {
    "valid": true,
    "tokenId": "uuid",
    "userRef": "sha256hash",
    "status": "ACTIVE",
    "expiresAt": "ISO8601-timestamp",
    "validationId": "uuid",
    "validationTxId": "blockchain-tx-id",
    "outcome": "VALID",
    "reason": ""
  }
}
```

**Response (200) - Invalid Token:**
```json
{
  "message": "Token is invalid",
  "validation": {
    "valid": false,
    "tokenId": "uuid",
    "userRef": "sha256hash",
    "status": "ACTIVE",
    "expiresAt": "ISO8601-timestamp",
    "validationId": "uuid",
    "validationTxId": "blockchain-tx-id",
    "outcome": "INVALID",
    "reason": "Token has expired"
  }
}
```

**Error Responses:**
```json
{
  "message": "Token Id is not present"
}
```
```json
{
  "message": "Token not found"
}
```

**Status Codes:**
- 200: Validation completed (valid or invalid)
- 400: Missing tokenId or token validation failed
- 404: Token not found
- 500: Server error

**Validation Audit Trail:**
Every validation creates an immutable record on blockchain including:
- Which organization validated the token (MSPID)
- Validation timestamp
- Transaction ID for forensic tracing
- Validation outcome and reason

---

### 6. Token Refresh

#### POST /token/refresh

Create new token from an expired token. Extends token lifetime with a new 1-hour validity period.

**Request Body:**
```json
{
  "tokenId": "uuid"
}
```

**Flow:**
1. Receive tokenId from request body
2. Validate tokenId is provided
3. Find token in PostgreSQL
4. Verify token exists and status = "EXPIRED"
5. Get consent linked to token
6. Verify consent exists and status = "GIVEN"
7. Generate new tokenId (UUID)
8. Calculate newExpiresAt = current_time + 1 hour
9. Call `refreshTokenOnFabric(oldTokenId, newTokenId, expiresAt)` for blockchain refresh
   - Blockchain creates new token with same userRef and recordHash
   - Old token kept for audit trail
10. Create new token in PostgreSQL with:
    - New tokenId
    - Same customerId and consentId
    - Status = "ACTIVE"
    - expiresAt = now + 1 hour
11. Return 201 with new token details

**Response (201) - Success:**
```json
{
  "message": "New token issued successfully.",
  "token": "uuid",
  "expiresAt": "ISO8601-timestamp"
}
```

**Error Responses:**
```json
{
  "message": "Token ID is not present"
}
```
```json
{
  "message": "Token not found"
}
```
```json
{
  "message": "Token is ACTIVE. Only expired tokens can be refreshed"
}
```
```json
{
  "message": "Consent not found"
}
```
```json
{
  "message": "Consent not granted. Cannot refresh token."
}
```

**Status Codes:**
- 201: New token issued successfully
- 400: Validation failed (token not EXPIRED, consent not GIVEN)
- 404: Token or consent not found
- 500: Server error

**Refresh Details:**
- Creates completely new token ID
- Preserves userRef and recordHash for continuity
- Preserves consentId linking
- Old token remains in audit trail as EXPIRED

---

### 7. Token Revocation

#### POST /token/revoke

Revoke an active token, marking it as "REVOKED" to prevent further use. Creates immutable revocation record on blockchain.

**Request Body:**
```json
{
  "tokenId": "uuid"
}
```

**Flow:**
1. Receive tokenId from request body
2. Validate tokenId is provided
3. Find token in PostgreSQL
4. Verify token exists
5. Verify token status = "ACTIVE"
6. Call `revokeTokenOnFabric(tokenId)` to record revocation on blockchain
   - Creates immutable record with REVOKED status
   - Records transaction ID and timestamp
7. Update token in PostgreSQL: status = "REVOKED"
8. Return 200 with revoked token ID

**Response (200) - Success:**
```json
{
  "message": "Token Revoked Successfully",
  "tokenId": "uuid"
}
```

**Error Responses:**
```json
{
  "message": "Token ID is not present"
}
```
```json
{
  "message": "Token not found"
}
```
```json
{
  "message": "Token is already REVOKED"
}
```

**Status Codes:**
- 200: Token revoked successfully
- 400: Missing tokenId or token not ACTIVE (already REVOKED/EXPIRED)
- 404: Token not found
- 500: Server error

**Revocation Details:**
- Only ACTIVE tokens can be revoked
- Creates immutable audit trail on blockchain
- Transaction ID recorded for forensic tracing
- Prevents further validation or use

---

## Blockchain Integration

### Hyperledger Fabric Smart Contract (kyc-contract.ts)

The eKYC Token Contract provides 8 core functions for immutable consent and token management:

#### 1. RecordConsent(consentId, customerId, status)

Records customer consent on the immutable blockchain ledger.

**Parameters:**
- `consentId` - Unique consent identifier (UUID)
- `customerId` - Associated customer identifier (UUID)
- `status` - Consent status (must be "GIVEN")

**Validation:**
- Requires consentId
- Requires customerId
- Status must be "GIVEN"

**Result:**
- Stores consent immutably: `{consentId, customerId, status, timestamp}`
- Timestamp added by blockchain network
- Cannot be modified once written

---

#### 2. GetConsent(consentId) [Read-Only]

Retrieves consent record from blockchain ledger (query operation).

**Parameters:**
- `consentId` - Consent ID to retrieve

**Returns:**
- Consent object as JSON string
- Includes: consentId, customerId, status, timestamp

**Error:**
- Returns error if consent doesn't exist

---

#### 3. IssueToken(tokenId, userRef, customerId, consentId, recordHash, expiresAt)

Issues eKYC token on blockchain with full audit trail.

**Parameters:**
- `tokenId` - Unique token identifier (UUID)
- `userRef` - SHA256 hash of customer verificationId (anonymous reference)
- `customerId` - Associated customer identifier
- `consentId` - Linked consent record ID
- `recordHash` - SHA256 hash of customer data (integrity verification)
- `expiresAt` - ISO8601 expiration timestamp

**Validation:**
- All parameters required
- Linked consent must exist on ledger
- Linked consent status must be "GIVEN"
- Token with this ID must not already exist (no duplicates)

**Result:**
- Stores token immutably: `{tokenId, userRef, customerId, consentId, recordHash, status="ACTIVE", expiresAt}`
- Ready for validation by any participating organization

---

#### 4. GetToken(tokenId) [Read-Only]

Retrieves token record from blockchain ledger (query operation).

**Parameters:**
- `tokenId` - Token ID to retrieve

**Returns:**
- Token object as JSON string
- Includes all token metadata

---

#### 5. ValidateToken(tokenId)

Validates token status and creates immutable validation audit record.

**Parameters:**
- `tokenId` - Token to validate

**Validation Checks:**
1. Token must exist
2. Token status must be "ACTIVE"
3. Current time must be before expiresAt
4. Linked consent must exist
5. Linked consent status must be "GIVEN"

**Result:**
- Creates immutable ValidationRecord: `{validationId, tokenId, requestingOrg (MSPID), outcome, reason, validatorMSP, timestamp, txId}`
- Returns validation result: `{valid, tokenId, userRef, status, expiresAt, validationId, validationTxId, outcome, reason}`
- Records which organization performed validation (MSPID)

**Outcomes:**
- VALID: Token passes all checks
- INVALID: Token fails one or more checks
  - Reason examples: "Token is EXPIRED", "Consent is not granted", "Consent does not exist"

---

#### 6. ExpireToken(tokenId)

Marks token as EXPIRED on blockchain after validating time has passed.

**Parameters:**
- `tokenId` - Token to expire

**Validation:**
- Token must exist
- Token must be "ACTIVE"
- Current time must be past expiresAt

**Result:**
- Updates token status to "EXPIRED"
- Timestamp recorded of expiration

---

#### 7. RefreshToken(oldTokenId, newTokenId, expiresAt)

Creates new token from expired token, maintaining user continuity.

**Parameters:**
- `oldTokenId` - Expired token to refresh from
- `newTokenId` - New token identifier
- `expiresAt` - New expiration timestamp

**Validation:**
- Old token must exist and be "EXPIRED"
- Linked consent must exist
- Linked consent status must be "GIVEN"
- New token must not already exist

**Result:**
- Creates new token with same userRef, recordHash, customerId, consentId
- New token gets status="ACTIVE" with new expiresAt
- Old token preserved for audit trail

---

#### 8. WithdrawConsent(consentId)

Records consent withdrawal on blockchain, invalidating all dependent tokens.

**Parameters:**
- `consentId` - Consent to withdraw

**Validation:**
- Consent must exist
- Consent must not already be "WITHDRAWN"

**Result:**
- Updates consent status to "WITHDRAWN"
- New timestamp recorded
- All validations of linked tokens will now fail

---

### Blockchain State Storage

**Ledger Data Structure:**

All objects are stored as JSON strings with unique state keys:

```
State Key: tokenId → Token object (32-64 bytes)
State Key: consentId → Consent object (256+ bytes)
State Key: validationId → ValidationRecord object (512+ bytes)
```

**Data Persistence:**
- CouchDB state database (3 instances, one per peer)
- Replicated across organization peers
- State version history maintained
- Queryable by all organizations on channel

**Transaction Record:**
- Every write operation recorded in blockchain blocks
- Immutable transaction history
- Transaction IDs for audit trail
- Block numbers and timestamps

---

### Dual-Write Pattern

The system uses a dual-write consistency pattern:

```
API Request
    ↓
┌──────────────────────┬──────────────────────┐
│  PostgreSQL Write    │  Blockchain Write    │
│  (Relational DB)     │  (Fabric Ledger)     │
│                      │                      │
│  - Customer record   │  - Consent record    │
│  - Consent record    │  - Token record      │
│  - Token record      │  - Validation record │
│                      │  - Timestamp         │
│  - Indexed query     │  - Immutable audit   │
│  - Analytics         │  - Distributed       │
│  - Fast access       │  - Consensus         │
└──────────────────────┴──────────────────────┘
    ↓               ↓
Success          Success
Response
```

**Consistency:**
- Both databases must succeed for transaction to succeed
- Fabric transaction ID returned for tracking
- Eventual consistency model
- Blockchain is source of truth for audit

---

## Data Models & Schema

### Customer Table
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
- `aadhaar`: 12-digit Aadhaar number (unique per customer)
- `verified`: Whether Aadhaar has been verified (true after successful verification)
- `verificationId`: Reference from Aadhaar verification service
- `createdAt`: Registration timestamp
- `consents`: One-to-many relation to Consent records
- `tokens`: One-to-many relation to Token records

---

### Consent Table
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
- `customer`: Relation to Customer
- `tokens`: One-to-many relation to Token records

**Important:** 
- Status is immutable once created
- Withdrawal creates NEW record with WITHDRAWN status
- All historical records preserved for audit trail

---

### Token Table
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
- `status`: String representing token state (ACTIVE, EXPIRED, REVOKED, Not-Active)
- `expiresAt`: 1-hour expiration timestamp
- `createdAt`: Token issuance timestamp
- `customer`: Relation to Customer
- `consent`: Relation to Consent

**Relationships:**
- Customer (1) ← → (many) Token
- Consent (1) ← → (many) Token
- Each token linked to customer and specific consent record

---

## Service Layer Functions

### Token Service (tokenService.ts)

#### expireToken(tokenId: string)

Marks token as EXPIRED in both PostgreSQL and blockchain.

**Validation:**
- Token must exist
- Token status must be "ACTIVE"
- Current time must be past expiresAt

**Operations:**
1. Find token in PostgreSQL
2. Validate time has actually passed
3. Call `expireTokenOnFabric(tokenId)`
4. Update token status to "EXPIRED"

**Errors:**
- "Token not found"
- "Token is already [status]"
- "Token has not expired yet"

---

#### refreshToken(tokenId: string)

Creates new ACTIVE token from EXPIRED token. Called by POST /token/refresh endpoint.

**Validation:**
- Token must exist
- Token must be "EXPIRED"
- Linked consent must exist and be "GIVEN"

**Operations:**
1. Find old token
2. Verify it's EXPIRED
3. Get linked consent
4. Validate consent is GIVEN
5. Generate new tokenId (UUID)
6. Calculate expiresAt = now + 1 hour
7. Call `refreshTokenOnFabric(oldTokenId, newTokenId, expiresAt)`
8. Create new token in PostgreSQL
9. Return new token

**Returns:**
- New token object with id, customerId, consentId, status="ACTIVE", expiresAt

---

#### revokeToken(tokenId: string)

Revokes ACTIVE token, marking as REVOKED in both databases.

**Validation:**
- Token must exist
- Token must be "ACTIVE"

**Operations:**
1. Find token
2. Verify it's ACTIVE
3. Call `revokeTokenOnFabric(tokenId)`
4. Update token status to "REVOKED"
5. Return updated token

**Errors:**
- "Token not found"
- "Token is already [status]"

---

### KYC Hash Service (kycHashService.ts)

#### createUserRef(verificationId: string): string

Creates SHA256 hash of verification ID for anonymous customer reference on blockchain.

**Process:**
1. Receive verificationId string
2. Create SHA256 hash object
3. Update with verificationId data
4. Return hex-encoded digest (64 characters)

**Purpose:**
- Anonymous customer reference for blockchain
- Prevents direct customer identification on public ledger
- Provides user continuity for token operations

**Example:**
```
Input:  "VERIFY_1726813243756_abc1234"
Output: "a3f2c8e1d9f7b6c2a4e8f1d3c5b7a9e1f2d4c6a8e0b1c3d5f7a9e1f3d5c7b9"
```

---

#### createRecordHash(record: {verificationId, verified, createdAt}): string

Creates SHA256 hash of customer verification record for data integrity.

**Process:**
1. Receive customer record object
2. Canonicalize to JSON: `{verificationId, verified, createdAt (ISO8601)}`
3. Create SHA256 hash
4. Return hex-encoded digest

**Purpose:**
- Data integrity verification on blockchain
- Detects tampering with customer record
- Links token to original verification state

**Example:**
```
Input: {
  verificationId: "VERIFY_...",
  verified: true,
  createdAt: "2026-10-12T10:30:45.123Z"
}
Output: "b4g3d9e2c8f1a5e7d0c3b6f9a2e5d8c1f4a7b0e3d6g9c2f5a8b1e4d7g0c3"
```

---

### Aadhaar Verification Service (aadhaarVerificationService.ts)

#### verifyAadhaar(aadhaar: string): AadhaarVerificationResponse

Mock Aadhaar verification service for development and testing.

**Validation Rules:**
1. Format validation: Must match `^\d{12}$` (exactly 12 digits)
2. Mock validation: Numbers ending in '0' are rejected

**Artificial Delay:**
- 500ms simulated processing time

**Returns:**
```typescript
{
  verified: boolean,              // true/false based on validation
  verificationId: string,         // "VERIFY_{timestamp}_{random}"
  aadhaar: string,               // Echo of input
  timestamp: string,             // ISO8601 timestamp
  message: string                // "...verified successfully" or "...failed"
}
```

**Error Scenarios:**
- Format invalid: verified=false, message="Invalid Aadhaar format"
- Ends in 0: verified=false, message="Aadhaar verification failed"
- Valid: verified=true, message="Aadhaar verified successfully"

**Note:** Production deployment requires integration with actual government Aadhaar API (UIDAI).

---

### Fabric Service (fabricService.ts)

Provides bidirectional communication with Hyperledger Fabric blockchain.

#### Connection Management

**TLS Mutual Authentication:**
- Certificate: `organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/signcerts/`
- Private Key: `organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore/`
- CA Certificate: `organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt`

**Gateway Configuration:**
- Channel: `kyctokenchannel`
- Chaincode: `kyc-token-cc`
- MSP ID: `Org1MSP`
- Peer Endpoint: `localhost:7051`

**Timeouts:**
- Query (evaluate): 5 seconds
- Endorsement: 15 seconds
- Submission: 15 seconds
- Commit status: 60 seconds

#### Transaction Functions

All functions follow pattern: createGateway → submitTransaction → close gateway

1. **recordConsentOnFabric(consentId, customerId)**
   - Calls: RecordConsent smart contract
   - Parameters: consentId, customerId, "GIVEN"
   - Returns: Transaction result

2. **issueTokenOnFabric(tokenId, userRef, customerId, consentId, recordHash, expiresAt)**
   - Calls: IssueToken smart contract
   - Parameters: All token attributes
   - Returns: Transaction result

3. **validateTokenOnFabric(tokenId)**
   - Calls: ValidateToken smart contract
   - Parameters: tokenId
   - Returns: Validation result JSON string (parsed to object)

4. **expireTokenOnFabric(tokenId)**
   - Calls: ExpireToken smart contract
   - Parameters: tokenId
   - Returns: Transaction result

5. **refreshTokenOnFabric(oldTokenId, newTokenId, expiresAt)**
   - Calls: RefreshToken smart contract
   - Parameters: oldTokenId, newTokenId, expiresAt
   - Returns: Transaction result

6. **revokeTokenOnFabric(tokenId)**
   - Calls: RevokeToken smart contract
   - Parameters: tokenId
   - Returns: Transaction result

7. **withdrawConsentOnFabric(consentId)**
   - Calls: WithdrawConsent smart contract
   - Parameters: consentId
   - Returns: Transaction result

---

## Security & Audit Trail

### Cryptographic Security

**SHA256 Hashing:**
- User Reference Hash: Prevents customer identification on public ledger
- Record Hash: Verifies data integrity hasn't been tampered
- Both hashes computed using Node.js native crypto module

**Digital Signatures:**
- All blockchain transactions signed with organization private key
- TLS mutual authentication between backend and Fabric
- X.509 certificates for identity verification

**Token Expiration:**
- 1-hour TTL for security
- Automatic expiration during validation
- Prevents indefinite token reuse

### Audit Trail & Compliance

**PostgreSQL Audit:**
- All records timestamped (createdAt)
- Customer registration history
- Consent change history (withdrawal creates new record)
- Token issuance, validation, refresh, revocation history

**Blockchain Audit (Immutable):**
- Consent recording with timestamp
- Token issuance with full metadata
- Validation records include:
  - Which org validated (MSPID)
  - Validation outcome and reason
  - Blockchain transaction ID
  - Exact timestamp
- Token state changes (expire, refresh, revoke, withdraw)
- Complete transaction history on distributed ledger
- Cannot be modified or deleted

**Audit Access:**
- All validation records queryable by participating organizations
- Transaction IDs link to specific blockchain blocks
- Complete chain of custody for compliance

### Non-Repudiation

**Blockchain Benefits:**
- Immutable record of all operations
- Distributed consensus across organizations
- Digital signatures on all transactions
- Each org has independent copy of ledger
- Cannot deny past operations (non-repudiation)

### Consent Withdrawal Effects

When consent is WITHDRAWN on blockchain:
1. New tokens cannot be issued
2. Existing token validation fails
3. Token refresh is blocked
4. Immutable record shows withdrawal action
5. All dependent operations fail gracefully

---

## Complete System Journey

### End-to-End Example: Customer Registration to Token Validation

```
STEP 1: Customer Registration & Consent
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

POST /consent
{
  "aadhaar": "234567890123",
  "consent": "GIVEN"
}
  ↓
Verify Aadhaar (format + mock rule check)
  ✓ Verified
  ↓
Create Customer {id: "cust-1", aadhaar, verified: true, verificationId: "VERIFY_..."}
  ↓
Create Consent {id: "consent-1", customerId: "cust-1", status: "GIVEN"}
  ↓
recordConsentOnFabric("consent-1", "cust-1") → Immutable consent record on ledger
  ↓
RESPONSE 201:
{
  "consent": {
    "id": "consent-1",
    "customerId": "cust-1",
    "status": "GIVEN",
    "createdAt": "2026-10-12T10:30:00Z"
  }
}


STEP 2: Token Issuance
━━━━━━━━━━━━━━━━━━━━

POST /token/issuance
{
  "customerId": "cust-1"
}
  ↓
Verify customer exists & verified ✓
  ↓
Get latest consent (status="GIVEN") ✓
  ↓
Check no ACTIVE token exists ✓
  ↓
Generate hashes:
  - userRef = SHA256("VERIFY_...") = "a3f2c8e..."
  - recordHash = SHA256(customer record) = "b4g3d9e..."
  ↓
Create token with:
  - tokenId: "token-1"
  - expiresAt: now + 1 hour = "2026-10-12T11:30:00Z"
  - status: "ACTIVE"
  ↓
issueTokenOnFabric("token-1", "a3f2c8e...", "cust-1", "consent-1", "b4g3d9e...", expiresAt)
  → Blockchain stores immutable token record
  ↓
PostgreSQL stores token record
  ↓
RESPONSE 201:
{
  "message": "Token issued successfully.",
  "token": "token-1",
  "expiresAt": "2026-10-12T11:30:00Z"
}


STEP 3: Token Validation
━━━━━━━━━━━━━━━━━━━━━━

POST /token/validate
{
  "tokenId": "token-1"
}
  ↓
Find token in PostgreSQL
  ↓
validateTokenOnFabric("token-1")
  → Blockchain checks:
    ✓ Token exists
    ✓ Status = "ACTIVE"
    ✓ expiresAt > now
    ✓ Consent = "GIVEN"
  ↓
  Create ValidationRecord on blockchain:
  {
    "validationId": "val-1",
    "tokenId": "token-1",
    "requestingOrg": "Org1MSP",
    "outcome": "VALID",
    "reason": "",
    "timestamp": "2026-10-12T11:00:00Z",
    "txId": "blockchain-tx-id-xyz"
  }
  ↓
RESPONSE 200:
{
  "message": "Token is valid",
  "validation": {
    "valid": true,
    "tokenId": "token-1",
    "userRef": "a3f2c8e...",
    "status": "ACTIVE",
    "expiresAt": "2026-10-12T11:30:00Z",
    "validationId": "val-1",
    "validationTxId": "blockchain-tx-id-xyz",
    "outcome": "VALID",
    "reason": ""
  }
}


STEP 4: Token Refresh (After Expiration)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[30+ minutes later, token now expired]

POST /token/validate
{
  "tokenId": "token-1"
}
  ↓
validateTokenOnFabric("token-1")
  → Blockchain checks:
    ✓ Token exists
    ✓ Status = "ACTIVE"
    ✗ expiresAt > now (FAILED: token expired)
  ↓
  Create ValidationRecord on blockchain:
  {
    "outcome": "INVALID",
    "reason": "Token has expired"
  }
  ↓
Backend calls expireToken("token-1")
  ↓
Update PostgreSQL: status = "EXPIRED"
  ↓
RESPONSE 200:
{
  "message": "Token is invalid",
  "validation": {
    "valid": false,
    "outcome": "INVALID",
    "reason": "Token has expired"
  }
}

POST /token/refresh
{
  "tokenId": "token-1"
}
  ↓
Verify token status = "EXPIRED" ✓
  ↓
Get consent, verify "GIVEN" ✓
  ↓
Generate new tokenId: "token-2"
  ↓
refreshTokenOnFabric("token-1", "token-2", newExpiresAt)
  → Blockchain creates new token record with same userRef/recordHash
  ↓
PostgreSQL creates new token:
{
  "id": "token-2",
  "customerId": "cust-1",
  "consentId": "consent-1",
  "status": "ACTIVE",
  "expiresAt": "2026-10-12T12:30:00Z"
}
  ↓
RESPONSE 201:
{
  "message": "New token issued successfully.",
  "token": "token-2",
  "expiresAt": "2026-10-12T12:30:00Z"
}
```

---

## Network Topology

### Hyperledger Fabric Network (kyctokenchannel)

```
┌─────────────────────────────────────────────┐
│         Fabric Network                      │
│                                             │
│  ┌─────────────┐  ┌─────────────┐         │
│  │   Org1      │  │   Org2      │         │
│  │             │  │             │         │
│  │ peer0.org1  │  │ peer0.org2  │         │
│  │ (CouchDB)   │  │ (CouchDB)   │         │
│  └─────────────┘  └─────────────┘         │
│                                             │
│  ┌─────────────┐  ┌──────────────────┐   │
│  │   Org3      │  │    Orderer       │   │
│  │             │  │    (Consensus)   │   │
│  │ peer0.org3  │  │                  │   │
│  │ (CouchDB)   │  │                  │   │
│  └─────────────┘  └──────────────────┘   │
│                                             │
│  Channel: kyctokenchannel                  │
│  Chaincode: kyc-token-cc v1.0              │
└─────────────────────────────────────────────┘
         ↑        ↑        ↑
         │        │        │ (gRPC TLS)
      Org1MSP  Org2MSP  Org3MSP
         │
    ┌────────────────┐
    │  Backend       │
    │  (Express API) │
    │  Org1MSP Admin │
    └────────────────┘
```

### Data Flow Summary

```
Customer → REST API → Controllers → Services → [Database + Blockchain]
                                        ↓
                            ┌─────────────────┐
                            │  PostgreSQL     │
                            │  (Relational)   │
                            │  + Fabric       │
                            │  (Immutable)    │
                            └─────────────────┘
                                    ↓
                        Query/Audit/Compliance
```

---

## Migration & Database History

The database schema has evolved through migrations:

1. **20260222052940_init** - Initial schema (Customer, Consent, Token)
2. **20260809055445_added_customer_and_token_table** - Additional fields
3. **20260813131324_aadhaar_verification** - Aadhaar verification fields
4. **20260818114319_added_consent_table** - Consent model refinement
5. **20260824044024_token_model** - Token model updates
6. **20260908093144_consent_status_change_to_enum** - Converted status to ConsentStatus enum

Current schema is at migration **20260908093144**.

---

## Environment Configuration

Backend requires `.env` file with:
```
DATABASE_URL=postgresql://user:password@localhost:5432/ekycdb
```

Fabric configuration loaded from:
- Certificates: `fabric/organizations/peerOrganizations/`
- Network config: `fabric/docker/docker-compose-*.yaml`
- Chaincode: `fabric/chaincode/`

---

## Performance Considerations

**PostgreSQL Queries:**
- O(1) customer lookup by Aadhaar (unique index)
- O(1) token lookup by ID (primary key)
- O(n) consent history retrieval (sorted by timestamp)

**Blockchain Operations:**
- Token issuance: ~15 seconds (endorsement + consensus)
- Token validation: ~15 seconds (endorsement) + immutable record creation
- Queries: ~5 seconds (peer evaluation)

**Dual-Write Consistency:**
- Eventually consistent model
- Both succeed or both fail
- Blockchain is source of truth for audit

---