# Hyperledger Fabric Network - eKYC Token & Consent

Complete Hyperledger Fabric 2.5.x network infrastructure for eKYC token and consent lifecycle management. Includes 3-organization setup, Fabric CA, CouchDB state storage, and KYC token smart contract (chaincode).

## Overview

This Fabric network provides an immutable, distributed ledger for:
- **Consent Records** - Immutable storage of customer consent (GIVEN or WITHDRAWN)
- **Token Issuance** - Blockchain-backed eKYC tokens with cryptographic metadata
- **Token Validation** - Creates immutable validation records tracking outcome, reason, and validating organization
- **Token Lifecycle** - Expiration, refresh, and revocation operations recorded immutably
- **Audit Trail** - Complete forensic history of all operations with transaction IDs and timestamps

## Architecture

### Network Topology

```
kyctokenchannel (single channel, all 3 orgs)
├── Org1MSP
│   ├── peer0.org1.example.com (port 7051)
│   ├── CouchDB (port 5984)
│   └── Fabric CA (port 7054)
├── Org2MSP
│   ├── peer0.org2.example.com (port 9051)
│   ├── CouchDB (port 6984)
│   └── Fabric CA (port 8054)
├── Org3MSP
│   ├── peer0.org3.example.com (port 11051)
│   ├── CouchDB (port 7984)
│   └── Fabric CA (port 9054)
└── orderer.example.com (port 7050)
    └── Fabric CA (port 9054)
```

**Consensus:** Raft ordering service (3+ orderers recommended for production)

### Directory Structure

```
fabric/
├── docker/
│   ├── docker-compose-ca.yaml         # Fabric CA setup
│   ├── docker-compose-couch.yaml      # CouchDB instances
│   └── docker-compose-network.yaml    # Peers, orderer, channels
├── organizations/
│   ├── fabric-ca/                     # CA server configs and keys
│   │   ├── orderer/
│   │   ├── org1/
│   │   ├── org2/
│   │   └── org3/
│   └── peerOrganizations/             # MSP certificates and keys
│       ├── org1.example.com/
│       ├── org2.example.com/
│       └── org3.example.com/
├── chaincode/                         # Smart contract (TypeScript)
│   ├── src/
│   │   └── kyc-contract.ts           # 8 contract functions
│   └── package.json
├── channel-artifacts/
│   └── kyctokenchannel.block          # Channel genesis block
├── configtx/
│   └── configtx.yaml                  # Channel and organization config
├── config/
│   └── core.yaml                      # Peer configuration
├── network.sh                         # Main orchestration script
└── invoke.sh                          # Chaincode invocation utility
```

## Quick Start

### Prerequisites

- Docker & Docker Compose 1.25+
- Go 1.18+ (for fabric-tools)
- curl
- jq (for JSON parsing)

### Deploy Network

```bash
cd fabric

# Full deployment (up + channel creation + chaincode deploy)
./network.sh all

# Or step-by-step:
./network.sh up              # Start CA, peers, orderer, CouchDB
./network.sh createchannel   # Create kyctokenchannel
./network.sh deploycc        # Deploy kyc-token-cc chaincode
```

### Verify Deployment

```bash
# Check running containers
docker ps | grep fabric

# Query a token (should fail initially)
./invoke.sh query GetToken test-token-123

# Check CouchDB (state database)
curl http://admin:adminpw@localhost:5984/_all_dbs
```

### Stop & Clean Up

```bash
# Stop network (preserves state)
./network.sh stop

# Resume (restart containers)
./network.sh start

# Full cleanup (removes containers, volumes)
./network.sh down

# Complete reset (removes all data)
./network.sh cleanall
```

## Smart Contract (Chaincode)

### Implementation

**File:** `chaincode/src/kyc-contract.ts`

**Language:** TypeScript (Node.js Chaincode SDK v2.5.x)

**Location:** Deployed on all 3 peers in channel kyctokenchannel

### 8 Core Contract Functions

#### 1. RecordConsent(consentId, customerId, status)
**Type:** Write (endorsement required)

Store customer consent immutably on ledger.

**Parameters:**
- `consentId` - Unique consent ID (UUID from backend)
- `customerId` - Associated customer ID (UUID)
- `status` - Must be "GIVEN" (validated in contract)

**Validation:**
- All parameters required
- Status must be "GIVEN"

**Result:**
```json
{
  "consentId": "uuid",
  "customerId": "uuid",
  "status": "GIVEN",
  "timestamp": "blockchain-timestamp"
}
```

**Errors:**
- "consentId is required"
- "customerId is required"
- "Consent status must be GIVEN"

---

#### 2. GetConsent(consentId)
**Type:** Query/Read-Only (no endorsement)

Retrieve consent record from ledger.

**Parameters:**
- `consentId` - Consent ID to retrieve

**Returns:** Consent object as JSON string

**Errors:**
- "consentId is required"
- "Consent {id} does not exist"

---

#### 3. IssueToken(tokenId, userRef, customerId, consentId, recordHash, expiresAt)
**Type:** Write (endorsement required)

Issue new eKYC token with full metadata.

**Parameters:**
- `tokenId` - Unique token ID (UUID)
- `userRef` - SHA256(verificationId) - anonymous customer reference
- `customerId` - Associated customer ID
- `consentId` - Linked consent ID
- `recordHash` - SHA256 hash of customer verification record (integrity)
- `expiresAt` - ISO8601 expiration timestamp

**Validation:**
- All parameters required
- Linked consent must exist
- Linked consent status must be "GIVEN"
- Token with this ID must not exist (no duplicates)

**Result:**
```json
{
  "tokenId": "uuid",
  "userRef": "sha256hash",
  "customerId": "uuid",
  "consentId": "uuid",
  "recordHash": "sha256hash",
  "status": "ACTIVE",
  "expiresAt": "ISO8601"
}
```

**Errors:**
- Any parameter missing validation error
- "Consent {id} does not exist"
- "Consent is not granted"
- "Token {id} already exists"

---

#### 4. GetToken(tokenId)
**Type:** Query/Read-Only (no endorsement)

Retrieve token record from ledger.

**Parameters:**
- `tokenId` - Token ID to retrieve

**Returns:** Token object as JSON string

**Errors:**
- "tokenId is required"
- "Token {id} does not exist"

---

#### 5. ValidateToken(tokenId)
**Type:** Write (endorsement required, creates validation record)

Validate token status and create immutable validation record.

**Parameters:**
- `tokenId` - Token to validate

**Validation Checks:**
1. Token must exist
2. Token status must be "ACTIVE"
3. Current time must be < expiresAt
4. Linked consent must exist
5. Linked consent status must be "GIVEN"

**Result - Creates ValidationRecord:**
```json
{
  "validationId": "uuid",
  "tokenId": "uuid",
  "requestingOrg": "Org1MSP|Org2MSP|Org3MSP",
  "outcome": "VALID|INVALID",
  "reason": "string (empty if VALID)",
  "validatorMSP": "MSPID",
  "timestamp": "blockchain-timestamp",
  "txId": "transaction-id"
}
```

**Returns to Caller:**
```json
{
  "valid": true|false,
  "tokenId": "uuid",
  "userRef": "sha256hash",
  "status": "ACTIVE",
  "expiresAt": "ISO8601",
  "validationId": "uuid",
  "validationTxId": "txId",
  "outcome": "VALID|INVALID",
  "reason": "string"
}
```

**Possible Outcomes:**
- VALID: Token passes all checks
- INVALID with reasons:
  - "Token is ACTIVE|EXPIRED|REVOKED"
  - "Token has expired"
  - "Consent {id} does not exist"
  - "Consent is not granted"

**Audit Trail Features:**
- Records MSPID of validating organization
- Stores exact blockchain timestamp
- Links to transaction ID for forensic tracing
- Cannot be modified or deleted (immutable)

---

#### 6. ExpireToken(tokenId)
**Type:** Write (endorsement required)

Mark token as EXPIRED after time passes.

**Parameters:**
- `tokenId` - Token to expire

**Validation:**
- Token must exist
- Token status must be "ACTIVE"
- Current time must be >= expiresAt

**Result:**
```json
{
  "tokenId": "uuid",
  "status": "EXPIRED",
  "timestamp": "blockchain-timestamp"
}
```

**Errors:**
- "tokenId is required"
- "Token {id} does not exist"
- "Token is already {status}"
- "Token has not expired yet"

---

#### 7. RefreshToken(oldTokenId, newTokenId, expiresAt)
**Type:** Write (endorsement required)

Create new token from expired token, maintaining user continuity.

**Parameters:**
- `oldTokenId` - Expired token ID
- `newTokenId` - New token ID (UUID)
- `expiresAt` - New expiration timestamp

**Validation:**
- Old token must exist and be "EXPIRED"
- Linked consent must exist and be "GIVEN"
- New token must not exist

**Result - Stores 2 Records:**

Old token updated:
```json
{
  "tokenId": "old-uuid",
  "status": "EXPIRED"  // Preserved for audit
}
```

New token created:
```json
{
  "tokenId": "new-uuid",
  "userRef": "sha256hash",        // Copied from old
  "customerId": "uuid",            // Copied from old
  "consentId": "uuid",             // Copied from old
  "recordHash": "sha256hash",      // Copied from old
  "status": "ACTIVE",
  "expiresAt": "new-ISO8601"
}
```

**Errors:**
- Any parameter missing validation
- "Token {id} does not exist"
- "Only expired tokens can be refreshed"
- "Consent {id} does not exist"
- "Consent is not granted"
- "Token {id} already exists"

---

#### 8. WithdrawConsent(consentId)
**Type:** Write (endorsement required)

Record consent withdrawal, invalidates dependent tokens.

**Parameters:**
- `consentId` - Consent to withdraw

**Validation:**
- Consent must exist
- Consent status must not already be "WITHDRAWN"

**Result:**
```json
{
  "consentId": "uuid",
  "status": "WITHDRAWN",
  "timestamp": "new-blockchain-timestamp"
}
```

**Side Effects:**
- All dependent tokens fail validation (consent is now WITHDRAWN)
- Token refresh blocked for this consent
- New tokens cannot be issued with this consent

**Errors:**
- "consentId is required"
- "Consent {id} does not exist"
- "Consent is already WITHDRAWN"

## Chaincode Development

### Building

```bash
# From fabric directory
cd chaincode

# Install dependencies
npm install

# Build TypeScript
npm run build

# Output: dist/kyc-contract.js
```

### Writing Custom Functions

```typescript
import { Contract, Context } from "fabric-contract-api";

export class EKYCContract extends Contract {
  @Transaction()  // Marks as endorsable write operation
  async MyFunction(ctx: Context, param1: string): Promise<void> {
    // Validate inputs
    if (!param1) {
      throw new Error("param1 is required");
    }

    // Get state
    const existing = await ctx.stub.getState("key");

    // Put state
    const data = { param1, timestamp: ctx.stub.getTxTimestamp() };
    await ctx.stub.putState("key", Buffer.from(JSON.stringify(data)));
  }

  @Transaction(false)  // Read-only query
  async GetData(ctx: Context, key: string): Promise<string> {
    const data = await ctx.stub.getState(key);
    if (!data || data.length === 0) {
      throw new Error(`Key ${key} not found`);
    }
    return data.toString();
  }
}
```

### Deploying Custom Functions

```bash
# 1. Update kyc-contract.ts with new function
# 2. Build chaincode
npm run build

# 3. Deploy from fabric directory
./network.sh deploycc

# 4. Invoke
./invoke.sh invoke kyc-contract MyFunction param1
```

## Invoking Chaincode

### Using invoke.sh Script

```bash
# Query function (read-only, no endorsement)
./invoke.sh query GetToken token-uuid

# Invoke function (write, requires endorsement)
./invoke.sh invoke kyc-contract RecordConsent consent-id cust-id GIVEN

# Invoke with parameters
./invoke.sh invoke kyc-contract IssueToken token-id userref cust-id consent-id recHash "2026-10-12T11:30:00Z"
```

### Using Fabric CLI

```bash
# Access peer container
docker exec -it fabric-peer0-org1 bash

# Set environment
export FABRIC_CFG_PATH=/etc/hyperledger/fabric
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID=Org1MSP
export CORE_PEER_MSPCONFIGPATH=/etc/hyperledger/fabric/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=peer0.org1.example.com:7051

# Query token
peer chaincode query -C kyctokenchannel -n kyc-token-cc -c '{"function":"GetToken","Args":["token-uuid"]}'

# Invoke (record consent)
peer chaincode invoke -C kyctokenchannel -n kyc-token-cc -c '{"function":"RecordConsent","Args":["consent-1","cust-1","GIVEN"]}'
```

## CouchDB Access

### Web UI

```
Org1: http://localhost:5984/_utils      (admin/adminpw)
Org2: http://localhost:6984/_utils
Org3: http://localhost:7984/_utils
```

### REST API

```bash
# List all documents (tokens + consents)
curl http://admin:adminpw@localhost:5984/kyctokenchannel/_all_docs

# Query specific token
curl http://admin:adminpw@localhost:5984/kyctokenchannel/token-uuid

# Query by type (if using CouchDB selectors)
curl -X POST http://admin:adminpw@localhost:5984/kyctokenchannel/_find \
  -H "Content-Type: application/json" \
  -d '{
    "selector": {
      "status": "ACTIVE"
    }
  }'
```

## Network Configuration

### Channel Configuration (configtx.yaml)

- **Channel Name:** kyctokenchannel
- **Organizations:** Org1MSP, Org2MSP, Org3MSP
- **Orderer:** orderer.example.com (Raft consensus)
- **Policies:** 2-of-3 signatures required for updates

### Peer Configuration (core.yaml)

- **Ledger Type:** File + CouchDB
- **State DB:** CouchDB (queryable, better performance)
- **Endorsement Policy:** Default (any org can endorse)

### Chaincode Policy

- **Instantiation Policy:** Any organization
- **Endorsement Policy:** Any organization (can be customized)

## Monitoring

### Container Logs

```bash
# Peer logs
docker logs fabric-peer0-org1

# Orderer logs
docker logs fabric-orderer

# CouchDB logs
docker logs fabric-couchdb-org1

# Watch logs in real-time
docker logs -f fabric-peer0-org1
```

### CouchDB Monitoring

```bash
# DB size
curl http://admin:adminpw@localhost:5984/kyctokenchannel

# Document count
curl http://admin:adminpw@localhost:5984/kyctokenchannel/_design_docs | jq '.doc_count'

# Replication status
curl http://admin:adminpw@localhost:5984/_replicator
```

### Chaincode Logs

```bash
# Logs are in peer container
docker logs fabric-peer0-org1 | grep "kyc-contract"

# Or in chaincode container
docker logs fabric-kyc-token-cc-<version>
```

## Network Commands Reference

```bash
# Start all infrastructure
./network.sh up

# Create channel
./network.sh createchannel

# Deploy chaincode
./network.sh deploycc

# Upgrade chaincode
./network.sh deploycc --upgrade

# Stop (pause, preserves state)
./network.sh stop

# Start (resume)
./network.sh start

# Down (stop, remove containers)
./network.sh down

# Clean all (complete reset - WARNING: deletes data)
./network.sh cleanall
```

## Troubleshooting

**Network won't start:**
```bash
# Check Docker is running
docker ps

# Remove stale containers
docker ps -a | grep fabric | awk '{print $1}' | xargs docker rm -f

# Clean volumes
docker volume prune -f

# Retry
./network.sh all
```

**Chaincode invoke fails:**
```bash
# Check peer is running
docker ps | grep peer0-org1

# Check logs
docker logs fabric-peer0-org1 | tail -20

# Verify chaincode is installed
docker exec fabric-peer0-org1 peer lifecycle chaincode queryinstalled
```

**CouchDB connection error:**
```bash
# Check CouchDB is running
docker ps | grep couchdb

# Test connection
curl http://admin:adminpw@localhost:5984/

# Check logs
docker logs fabric-couchdb-org1
```

**Transaction rejected:**
```bash
# Check endorsement policy
# Review peer logs for failure reason
docker logs fabric-peer0-org1 | grep -i "reject\|error\|fail"

# Query chaincode to see state
./invoke.sh query GetToken test-token
```

## Production Considerations

**Security:**
- Use TLS with proper certificates (not self-signed)
- Rotate CA certificates regularly
- Implement access control policies
- Use network policies to restrict inter-container communication

**Performance:**
- Monitor CouchDB disk usage (can grow large with many transactions)
- Implement data retention/pruning strategies
- Use multiple orderers for fault tolerance
- Consider sharding for horizontal scaling

**High Availability:**
- Deploy 3+ orderers (Raft requires quorum)
- Multiple peers per organization
- Backup blockchain ledger periodically
- Test disaster recovery procedures

## Documentation

- [Fabric Official Docs](https://hyperledger-fabric.readthedocs.io/)
- [Fabric Concepts](./docs/UnderstandingHLF.md)
- [Chaincode Development](https://hyperledger-fabric.readthedocs.io/en/latest/smartcontract/smartcontract.html)
- [CouchDB Queries](https://docs.couchdb.org/en/stable/api/database/find.html)

## License

MIT License
