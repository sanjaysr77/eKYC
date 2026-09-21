import { Contract, Context, Info, Transaction } from "fabric-contract-api"

@Info({ //Decorator
    title: "eKYC Token Contract",
    description: "Chaincode for eKYC consent and token lifecycle",
    version: "1.0.0",
})

export class EKYCContract extends Contract {

    @Transaction() //Decorator
    async RecordConsent(ctx: Context, consentId: string, customerId: string, status: string): Promise<void> {

        if (!consentId) {
            throw new Error("consentId is required")
        }

        if (!customerId) {
            throw new Error("customerId is required")
        }

        if (status !== "GIVEN") {
            throw new Error("Consent status must be GIVEN")
        }

        const consent = {
            consentId,
            customerId,
            status,
            timestamp: ctx.stub.getTxTimestamp(),
        };

        await ctx.stub.putState(
            consentId,
            Buffer.from(JSON.stringify(consent))
        );
    }

    @Transaction(false)
    async GetConsent(
        ctx: Context,
        consentId: string
    ): Promise<string> {

        if (!consentId) {
            throw new Error("consentId is required")
        }

        const consentBytes = await ctx.stub.getState(consentId)

        if (!consentBytes || consentBytes.length === 0) {
            throw new Error(`Consent ${consentId} does not exist`)
        }

        return consentBytes.toString()
    }

    @Transaction()
    async IssueToken(
        ctx: Context, tokenId: string, customerId: string, consentId: string, recordHash: string, expiresAt: string
    ): Promise<void> {

        if (!tokenId) {
            throw new Error("tokenId is required")
        }

        if (!customerId) {
            throw new Error("customerId is required")
        }

        if (!consentId) {
            throw new Error("consentId is required")
        }

        if (!recordHash) {
            throw new Error("recordHash is required")
        }

        if (!expiresAt) {
            throw new Error("expiresAt is required")
        }

        const consentBytes = await ctx.stub.getState(consentId)

        if (!consentBytes || consentBytes.length === 0) {
            throw new Error(`Consent ${consentId} does not exist`)
        }

        const consent = JSON.parse(consentBytes.toString());

        if (consent.status !== "GIVEN") {
            throw new Error("Consent is not granted")
        }

        const existingToken = await ctx.stub.getState(tokenId);

        if (existingToken && existingToken.length > 0) {
            throw new Error(`Token ${tokenId} already exists`)
        }

        const token = { tokenId, customerId, consentId, recordHash, status: "ACTIVE" }

        await ctx.stub.putState(
            tokenId,
            Buffer.from(JSON.stringify(token))
        )
    }
}