# eKYC Application Flows

## 1. Customer Verification

### POST /consent

Customer submits Aadhaar and consent. System verifies Aadhaar, creates or finds customer, and records consent.

1. Receive Aadhaar + consent boolean
2. Verify Aadhaar via verification service
3. Check if customer exists (by Aadhaar)
4. If new: Create customer with verified=true, verificationId
5. If existing: Use existing customer
6. Create consent record linked to customer
7. Return consent record (id, customerId, granted, createdAt)

**Status codes:**
- 201: Consent created successfully
- 400: Aadhaar verification failed
- 500: Server error

---

## 2. Consent Retrieval

### GET /consent/customer/:customerId

Retrieve all consent records for a customer, newest first.

1. Receive customerId from URL params
2. Validate customerId is provided and is a string
3. Query all consent records for that customer
4. Sort by createdAt descending (newest → oldest)
5. Return array of consent records

**Status codes:**
- 200: Consent records retrieved
- 400: Invalid customer ID
- 404: No consent records found
- 500: Server error

---

## 3. Token Issuance

### POST /token

Issue or retrieve an active token for a customer. Validates customer verification and consent before creating token.

1. Receive customerId
2. Validate customerId is provided
3. Find customer with latest consent
4. Check if customer exists
5. Check if customer is verified (Aadhaar verified)
6. Extract latest consent (already sorted by recency)
7. Check if consent is granted
8. Find most recent expired token (expiresAt <= now) and mark as EXPIRED
   - Sorts by createdAt descending to get the latest expired token
9. Check for existing active/non-expired token
10. If active token exists: Return it (id, expiresAt)
11. If no active token: Create new token with 1-hour expiration
12. Return new token (id, expiresAt)

**Status codes:**
- 200: Token issued/retrieved
- 400: Validation failed (missing ID, not verified, no consent)
- 404: Customer not found
- 500: Server error

---

## 4. Token Lifecycle (Future Implementation)

### ValidateToken

Verify if a token is valid and not expired.

- Input: token
- Check if token exists, status is ACTIVE, expiresAt > now
- Return: valid (boolean), message

### ExpireToken

Manually mark a token as EXPIRED.

- Input: tokenId
- Update token status to EXPIRED
- Return: success message

### RefreshToken

Issue a new token if the old one is about to expire.

- Input: customerId, existing tokenId
- Check if old token exists and expiresAt - now < refresh_threshold (e.g., 10 minutes)
- Create new token with fresh 1-hour expiration
- Return: new tokenId, expiresAt

### RevokeToken

Revoke a token before expiration (user logout).

- Input: tokenId
- Update token status to REVOKED
- Return: success message

---

## 5. Future Hyperledger Flow

Blockchain integration for immutable consent and token records.

- Store consent records on Hyperledger (immutable audit trail)
- Link token issuance to Hyperledger consent record
- Verify token authenticity against blockchain records

---

## Database Relations

```
Customer (1) → (many) Consent
Customer (1) → (many) Token
Consent (1) → (many) Token
```

Each token is linked to a specific consent record, creating an audit trail of which consent granted which token.
