# eKYC Application Flows

## API Endpoints Overview

**Consent Management:**
- `POST /consent` - Submit Aadhaar and consent for verification
- `GET /consent/customer/:customerId` - Retrieve consent records for a customer

**Token Management:**
- `POST /token/issuance` - Issue or retrieve active token
- `POST /token/validate` - Validate token status

---

## Consent Status Enum

The Consent model uses an enum for status instead of a string or boolean:

**Valid Values:**
- `GIVEN` - Consent has been granted by customer
- `WITHDRAWN` - Consent has been revoked by customer

This ensures type safety and prevents invalid status values from being stored.

---

## Token Status Values

The Token model supports multiple status states throughout its lifecycle:

**Valid Token Statuses:**
- `ACTIVE` - Token is valid and can be used (default when newly created)
- `EXPIRED` - Token's expiration time has passed (auto-marked by `markExpiredToken()`)
- `REVOKED` - Token has been explicitly revoked by user/system
- `Not-Active` - Legacy status (initial default, rarely used after first creation)

**Status Transitions:**
```
ACTIVE → EXPIRED (automatic, when expiresAt <= now)
ACTIVE → REVOKED (manual, via /token/revoke endpoint)
```

---

## 1. Customer Verification & Consent Submission

### POST /consent

Customer submits Aadhaar and consent. System verifies Aadhaar, creates or finds customer, and records consent.

**Request Body:**
```json
{
  "aadhaar": "123456789012",
  "consent": true
}
```

**Flow:**
1. Receive Aadhaar (12-digit string) + consent boolean
2. Verify Aadhaar via verification service
   - Mock service validates format (12 digits)
   - Returns verification result with verificationId
3. Check if customer exists (by Aadhaar)
4. If new: Create customer with verified=true, verificationId
5. If existing: Use existing customer
6. Create consent record linked to customer (status: "Active" by default)
7. Return consent record

**Response (201):**
```json
{
  "consent": {
    "id": "uuid",
    "customerId": "uuid",
    "granted": true,
    "status": "Active",
    "createdAt": "timestamp"
  }
}
```

**Status codes:**
- 201: Consent created successfully
- 400: Aadhaar verification failed (invalid format or verification failure)
- 500: Server error

---

## 2. Consent Retrieval

### GET /consent/customer/:customerId

Retrieve all consent records for a customer, newest first.

**URL Parameters:**
- `customerId` - Customer UUID

**Flow:**
1. Receive customerId from URL params
2. Validate customerId is provided and is a string
3. Query all consent records for that customer
4. Sort by createdAt descending (newest → oldest)
5. Return array of consent records

**Response (200):**
```json
{
  "customerId": "uuid",
  "consentRecords": [
    {
      "id": "uuid",
      "customerId": "uuid",
      "status": "GIVEN",
      "createdAt": "timestamp"
    }
  ]
}
```

**Note:** Status field uses enum values (`GIVEN` or `WITHDRAWN`), not string values.

**Status codes:**
- 200: Consent records retrieved
- 400: Invalid customer ID
- 404: No consent records found
- 500: Server error

---

## 3. Token Issuance

### POST /token/issuance

Issue or retrieve an active token for a customer. Validates customer verification and consent before creating token.

**Request Body:**
```json
{
  "customerId": "uuid"
}
```

**Flow:**
1. Receive customerId
2. Validate customerId is provided
3. Find customer with latest consent (ordered by createdAt desc, take 1)
4. Check if customer exists
5. Check if customer is verified (Aadhaar verified)
6. Extract latest consent
7. Check if consent is granted
8. Call `markExpiredToken()` service to update any expired tokens
   - Finds all ACTIVE tokens where expiresAt <= now
   - Updates their status to EXPIRED
9. Check for existing ACTIVE token with expiresAt > now
10. If active token exists: Return it (id, expiresAt)
11. If no active token: Create new token with:
    - Status: "ACTIVE"
    - ExpiresAt: now + 1 hour
    - Linked to customer and latest consent
12. Return token details

**Response (200) - Existing Token:**
```json
{
  "message": "Active token already exists",
  "token": "uuid",
  "expiresAt": "timestamp"
}
```

**Response (200) - New Token:**
```json
{
  "message": "Token issued successfully.",
  "token": "uuid",
  "expiresAt": "timestamp"
}
```

**Status codes:**
- 200: Token issued/retrieved successfully
- 400: Validation failed (missing ID, not verified, no consent)
- 404: Customer not found
- 500: Server error

---

## 4. Token Validation

### POST /token/validate

Validate if a token is active and not expired. Automatically marks expired tokens.

**Request Body:**
```json
{
  "token": "uuid"
}
```

**Flow:**
1. Receive tokenId from request body
2. Validate tokenId is provided
3. Find token by ID
4. Extract customerId from token
5. Call `markExpiredToken()` service to update expired tokens for this customer
6. Query for token with matching ID and status "ACTIVE"
7. If found: Token is valid
8. If not found: Token is expired, revoked, or doesn't exist

**Response (200) - Valid:**
```json
{
  "message": "Active Token exists",
  "token": {
    "id": "uuid",
    "customerId": "uuid",
    "consentId": "uuid",
    "status": "ACTIVE",
    "createdAt": "timestamp",
    "expiresAt": "timestamp"
  }
}
```

**Response (400) - Invalid:**
```json
{
  "message": "Validation failed, ACTIVE Token does not exist."
}
```

**Status codes:**
- 200: Token is valid and active
- 400: Missing tokenId or token is not active
- 404: Token not found
- 500: Server error

---

## 5. Token Service Functions

### markExpiredToken(customerId: string)

Internal service function called during token issuance and validation to automatically expire outdated tokens.

**Purpose:** Maintain token lifecycle by marking expired tokens as "EXPIRED"

**Logic:**
```typescript
await prisma.token.updateMany({
  where: {
    customerId,
    status: "ACTIVE",
    expiresAt: { lte: new Date() }
  },
  data: {
    status: "EXPIRED"
  }
})
```

**Called by:**
- Token issuance flow (before checking for active tokens)
- Token validation flow (before validating token status)

---

## 6. Aadhaar Verification Service

### verifyAadhaar(aadhaar: string)

Mock Aadhaar verification service for development/testing.

**Validation Rules:**
- Must be exactly 12 digits
- Mock rule: Aadhaar numbers ending in '0' are considered invalid

**Returns:**
```typescript
{
  verified: boolean,
  verificationId: string,  // Format: VERIFY_{timestamp}_{random}
  aadhaar: string,
  timestamp: string,
  message: string
}
```

**Note:** This is a mock service. Production would integrate with actual government Aadhaar verification APIs.

---

## 7. Token Refresh

### POST /token/refresh

Refresh an existing token or retrieve the active one if still valid.

**Request Body:**
```json
{
  "tokenId": "uuid"
}
```

**Flow:**
1. Receive tokenId from request body
2. Validate tokenId is provided
3. Find token by ID
4. Extract customerId and verify customer exists
5. Check if customer is verified
6. Find latest consent for customer
7. Validate consent exists and is granted
8. Call `markExpiredToken()` service to update expired tokens
9. Check for existing ACTIVE token
10. If ACTIVE token exists: Return it with status 200
11. If no ACTIVE token: Create new token with:
    - Status: "ACTIVE"
    - ExpiresAt: now + 1 hour
    - Linked to customer and latest consent
12. Return token with status 201

**Response (200) - Existing Active Token:**
```json
{
  "message": "Active Token exists",
  "existingToken": {
    "id": "uuid",
    "customerId": "uuid",
    "consentId": "uuid",
    "status": "ACTIVE",
    "createdAt": "timestamp",
    "expiresAt": "timestamp"
  }
}
```

**Response (201) - New Token:**
```json
{
  "message": "New token issued successfully.",
  "token": "uuid",
  "expiresAt": "timestamp"
}
```

**Status codes:**
- 200: Existing active token returned
- 201: New token issued successfully
- 400: Validation failed (missing tokenId, customer not verified, consent not granted)
- 403: Consent not granted
- 404: Token not found or customer not found
- 500: Server error

---

## 9. Token Revocation

### POST /token/revoke

Revoke an active token, marking it as "REVOKED" to prevent further use.

**Request Body:**
```json
{
  "tokenId": "uuid"
}
```

**Flow:**
1. Receive tokenId from request body
2. Validate tokenId is provided
3. Find token by ID
4. Check if token exists
5. Call `markExpiredToken()` service to update any expired tokens for this customer
   - This ensures we have the most current token status before checking if it's ACTIVE
6. Retrieve the updated token to check its current status
7. If token status is not "ACTIVE", return error with currentStatus
   - Cannot revoke a token that's already EXPIRED or REVOKED
8. If token is ACTIVE, update status to "REVOKED"
9. Return success response

**Response (200) - Success:**
```json
{
  "message": "Token Revoked Successfully",
  "tokenId": "uuid"
}
```

**Response (400) - Token Not Active:**
```json
{
  "message": "Token is already EXPIRED",
  "currentStatus": "EXPIRED"
}
```

**Note:** The `markExpiredToken()` service is called before checking token status to ensure expired tokens are updated first. This prevents attempting to revoke a token that has already expired naturally.

**Status codes:**
- 200: Token revoked successfully
- 400: Missing tokenId or token is not ACTIVE (already EXPIRED/REVOKED)
- 404: Token not found
- 500: Server error

---

## 10. Token Revocation (Hyperledger)

### RevokeToken (Blockchain)

Revoke an active token on the blockchain, marking it as "REVOKED" to prevent further use. This provides an immutable audit trail of token revocations.

**Smart Contract Method:**
```typescript
RevokeToken(ctx: Context, tokenId: string)
```

**Request Parameters:**
- `tokenId` - Token UUID to revoke

**Flow:**
1. Receive tokenId from request
2. Validate tokenId is provided
3. Retrieve token from blockchain ledger using `getState(tokenId)`
4. Check if token exists on blockchain
5. Parse token data and verify current status
6. If token status is not "ACTIVE", throw error (cannot revoke expired/already revoked tokens)
7. Update token status to "REVOKED"
8. Write updated token back to blockchain using `putState()`
9. Return success (transaction is recorded immutably on ledger)

**Success Response:**
```json
{
  "tokenId": "uuid",
  "status": "REVOKED",
  "txId": "blockchain-transaction-id",
  "message": "Token revoked successfully on blockchain"
}
```

**Error Responses:**
```json
{
  "error": "Token xyz does not exist"
}
```
```json
{
  "error": "Token is already EXPIRED"
}
```

**Blockchain Benefits:**
- Immutable revocation record (cannot be altered or deleted)
- Distributed consensus ensures all organizations see the same state
- Complete audit trail with transaction ID and timestamp
- Cross-organizational token revocation visibility

**Status codes:**
- 200: Token revoked successfully on blockchain
- 400: Invalid request or token not in ACTIVE state
- 404: Token not found on ledger
- 500: Blockchain/chaincode error

---

## 11. Future Enhancements

### Hyperledger Integration
Blockchain integration for immutable consent and token records.

- Store consent records on Hyperledger (immutable audit trail)
- Link token issuance to Hyperledger consent record
- Verify token authenticity against blockchain records

---

## Database Schema

### Customer
```prisma
- id: String (UUID, Primary Key)
- aadhaar: String (Unique)
- verified: Boolean (default: false)
- verificationId: String (Unique, nullable)
- createdAt: DateTime (default: now)
- Relations: consents[], tokens[]
```

### Consent
```prisma
- id: String (UUID, Primary Key)
- customerId: String (Foreign Key → Customer.id)
- granted: Boolean
- status: String (default: "Active")
- createdAt: DateTime (default: now)
- Relations: customer, tokens[]
```

### Token
```prisma
- id: String (UUID, Primary Key)
- customerId: String (Foreign Key → Customer.id)
- consentId: String (Foreign Key → Consent.id)
- status: String (default: "Not-Active")
- createdAt: DateTime (default: now)
- expiresAt: DateTime
- Relations: customer, consent
```

### Relationships
```
Customer (1) → (many) Consent
Customer (1) → (many) Token
Consent (1) → (many) Token
```

Each token is linked to both a customer and a specific consent record, creating a complete audit trail.