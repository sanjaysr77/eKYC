# eKYC v1.0

Identity verification backend built with TypeScript, Node.js, Prisma, and PostgreSQL on Neon.

Handles the full KYC lifecycle — customer onboarding, document processing, verification workflows, and state transitions across `PENDING`, `UNDER_REVIEW`, `VERIFIED`, and `REJECTED`. Built in layers: validation, auth, business logic, audit trails, and the production plumbing that holds it together.

The longer arc includes OCR-based document extraction, role-based access control, rate limiting, and a complete audit log on every state change. Further down the road, the verification layer is intended to anchor onto a Hyperledger Fabric network — making KYC records tamper-evident and auditable across institutions without centralizing trust.
