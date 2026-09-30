import { Contract, Context, Info, Transaction } from "fabric-contract-api"
import crypto from "node:crypto";

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

    @Transaction(false) //Dev purpose only, false means READ ONLY
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
        ctx: Context,
        tokenId: string,
        userRef: string,
        customerId: string,
        consentId: string,
        recordHash: string,
        expiresAt: string
    ): Promise<void> {

        if (!tokenId) {
            throw new Error("tokenId is required")
        }

        if (!userRef) {
            throw new Error("userRef is required")
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

        const consentBytes = await ctx.stub.getState(consentId) //Can we create another token using the same consent id.

        if (!consentBytes || consentBytes.length === 0) {
            throw new Error(`Consent ${consentId} does not exist`)
        }

        const consent = JSON.parse(consentBytes.toString())

        if (consent.status !== "GIVEN") {
            throw new Error("Consent is not granted")
        }

        const existingToken = await ctx.stub.getState(tokenId)

        if (existingToken && existingToken.length > 0) {
            throw new Error(`Token ${tokenId} already exists`)
        }

        const token = {
            tokenId,
            userRef,
            customerId,
            consentId,
            recordHash,
            status: "ACTIVE",
            expiresAt
        }

        await ctx.stub.putState(
            tokenId,
            Buffer.from(JSON.stringify(token))
        )
    }

    @Transaction(false) //Dev purpose only, false means READ ONLY
    async GetToken(
        ctx: Context,
        tokenId: string
    ): Promise<string> {

        if (!tokenId) {
            throw new Error("tokenId is required")
        }

        const tokenBytes = await ctx.stub.getState(tokenId)

        if (!tokenBytes || tokenBytes.length === 0) {
            throw new Error(`Token ${tokenId} does not exist`)
        }

        return tokenBytes.toString()
    }

    @Transaction()
    async ValidateToken(
        ctx: Context,
        tokenId: string
    ): Promise<string> {

        if (!tokenId) {
            throw new Error("tokenId is required")
        }

        const tokenBytes = await ctx.stub.getState(tokenId)

        if (!tokenBytes || tokenBytes.length === 0) {
            throw new Error(`Token ${tokenId} does not exist`)
        }

        const token = JSON.parse(tokenBytes.toString())

        const validationId = crypto.randomUUID()

        let outcome = "VALID"
        let reason = ""

        if (token.status !== "ACTIVE") {
            outcome = "INVALID"
            reason = `Token is ${token.status}`
        }

        const currentTime = new Date()
        const expiresAt = new Date(token.expiresAt)

        if (outcome === "VALID" && currentTime >= expiresAt) {
            outcome = "INVALID"
            reason = "Token has expired"
        }

        const consentBytes = await ctx.stub.getState(token.consentId)

        if (!consentBytes || consentBytes.length === 0) {
            outcome = "INVALID"
            reason = `Consent ${token.consentId} does not exist`
        }
        else {
            const consent = JSON.parse(consentBytes.toString())

            if (consent.status !== "GIVEN") {
                outcome = "INVALID"
                reason = "Consent is not granted"
            }
        }

        const validationRecord = {
            validationId,
            tokenId,
            requestingOrg: ctx.clientIdentity.getMSPID(),
            outcome,
            reason,
            validatorMSP: ctx.clientIdentity.getMSPID(),
            timestamp: ctx.stub.getTxTimestamp(),
            txId: ctx.stub.getTxID()
        }

        await ctx.stub.putState(
            validationId,
            Buffer.from(JSON.stringify(validationRecord))
        )

        return JSON.stringify({
            valid: outcome === "VALID",
            tokenId: token.tokenId,
            userRef: token.userRef,
            status: token.status,
            expiresAt: token.expiresAt,
            validationId,
            validationTxId: ctx.stub.getTxID(),
            outcome,
            reason
        })
    }

    @Transaction()
    async ExpireToken(ctx: Context, tokenId: string): Promise<void> {

        if (!tokenId)
            throw new Error("tokenId is required")

        const tokenBytes = await ctx.stub.getState(tokenId)

        if (!tokenBytes || tokenBytes.length === 0) {
            throw new Error(`Token ${tokenId} does not exist`)
        }

        const token = JSON.parse(tokenBytes.toString())

        if (token.status !== "ACTIVE") {
            throw new Error(`Token is already ${token.status}`)
        }

        const currentTime = new Date()
        const expiresAt = new Date(token.expiresAt)

        if (currentTime < expiresAt) {
            throw new Error("Token has not expired yet")
        }

        token.status = "EXPIRED"

        await ctx.stub.putState(
            tokenId,
            Buffer.from(JSON.stringify(token))
        )
    }

    @Transaction()
    async RefreshToken(
        ctx: Context,
        oldTokenId: string,
        newTokenId: string,
        expiresAt: string
    ): Promise<void> {

        if (!oldTokenId) {
            throw new Error("oldTokenId is required")
        }

        if (!newTokenId) {
            throw new Error("newTokenId is required")
        }

        if (!expiresAt) {
            throw new Error("expiresAt is required")
        }

        const oldTokenBytes = await ctx.stub.getState(oldTokenId)

        if (!oldTokenBytes || oldTokenBytes.length === 0) {
            throw new Error(`Token ${oldTokenId} does not exist`)
        }

        const oldToken = JSON.parse(oldTokenBytes.toString())

        if (oldToken.status !== "EXPIRED") {
            throw new Error("Only expired tokens can be refreshed")
        }

        const consentBytes = await ctx.stub.getState(oldToken.consentId)

        if (!consentBytes || consentBytes.length === 0) {
            throw new Error(`Consent ${oldToken.consentId} does not exist`)
        }

        const consent = JSON.parse(consentBytes.toString())

        if (consent.status !== "GIVEN") {
            throw new Error("Consent is not granted")
        }

        const existingToken = await ctx.stub.getState(newTokenId)

        if (existingToken && existingToken.length > 0) {
            throw new Error(`Token ${newTokenId} already exists`)
        }

        const newToken = {
            tokenId: newTokenId,
            userRef: oldToken.userRef,
            customerId: oldToken.customerId,
            consentId: oldToken.consentId,
            recordHash: oldToken.recordHash,
            status: "ACTIVE",
            expiresAt
        }

        await ctx.stub.putState(
            newTokenId,
            Buffer.from(JSON.stringify(newToken))
        )

        oldToken.status = "EXPIRED"

        await ctx.stub.putState(
            oldTokenId,
            Buffer.from(JSON.stringify(oldToken))
        )
    }
}