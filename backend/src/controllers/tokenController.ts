
import 'dotenv/config'
import { PrismaClient } from "@prisma/client/index"
import { PrismaPg } from '@prisma/adapter-pg'
import { createUserRef, createRecordHash } from "../services/kycHashService.js";
import { issueTokenOnFabric, validateTokenOnFabric } from "../services/fabricService.js";
import { type Request, type Response } from "express"
import { expireToken, refreshToken, revokeToken } from '../services/tokenService.js'

const pool = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter: pool })

export async function tokenIssuance(req: Request, res: Response) {
    try {
        const customerId = req.body.customerId;

        if (!customerId) {
            return res.status(400).json({
                message: "Customer Id is not present"
            });
        }

        const customer = await prisma.customer.findUnique({
            where: { id: customerId },
            include: {
                consents: {
                    orderBy: { createdAt: "desc" },
                    take: 1
                }
            }
        });

        if (!customer) {
            return res.status(404).json({
                message: "Customer is not found"
            });
        }

        if (!customer.verified) {
            return res.status(400).json({
                message: "Customer is not verified"
            });
        }

        if (!customer.verificationId) {
            return res.status(400).json({
                message: "Customer verification ID is missing"
            });
        }

        const latestConsent = customer.consents[0];

        if (!latestConsent || latestConsent.status !== "GIVEN") {
            return res.status(400).json({
                message: "Consent not granted. Token cannot be generated",
            });
        }

        const existingToken = await prisma.customer.findUnique({
            where: {
                id: customerId,
            },
            include: {
                tokens: {
                    orderBy: { createdAt: "desc" },
                    take: 1
                }
            }
        });

        if (!existingToken) {
            return res.status(404).json({
                message: "Customer is not found"
            });
        }

        const latestToken = existingToken.tokens[0];

        if (existingToken) {
            return res.status(400).json({
                message: "Token Already Exists. Try Refreshing",
                token: latestToken
            });
        }

        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 1);

        const userRef = createUserRef(customer.verificationId);

        const recordHash = createRecordHash({
            verificationId: customer.verificationId,
            verified: customer.verified,
            createdAt: customer.createdAt
        });

        const tokenId = crypto.randomUUID();

        await issueTokenOnFabric(
            tokenId,
            userRef,
            customer.id,
            latestConsent.id,
            recordHash,
            expiresAt.toISOString()
        );

        const token = await prisma.token.create({
            data: {
                id: tokenId,
                customerId: customer.id,
                consentId: latestConsent.id,
                expiresAt,
                status: "ACTIVE"
            }
        });

        return res.status(201).json({
            message: "Token issued successfully.",
            expiresAt: token.expiresAt,
            token: token.id
        });

    } catch (error) {
        console.error("Token Error:", error);

        return res.status(500).json({
            message: "Internal Server Error"
        });
    }
}

export async function validate(req: Request, res: Response) {
    try {
        const tokenId = req.body.tokenId;

        if (!tokenId) {
            return res.status(400).json({
                message: "Token Id is not present"
            });
        }

        const token = await prisma.token.findUnique({
            where: { id: tokenId }
        });

        if (!token) {
            return res.status(404).json({
                message: "Token not found"
            });
        }

        const validationResult = await validateTokenOnFabric(tokenId);

        const validation = JSON.parse(validationResult);

        if (validation.reason === "Token has expired") {
            await expireToken(tokenId);
        }

        return res.status(200).json({
            message: validation.valid
                ? "Token is valid"
                : "Token is invalid",
            validation
        });

    } catch (error) {
        console.error("Validation Error:", error);

        return res.status(400).json({
            message: error instanceof Error
                ? error.message
                : "Token validation failed"
        });
    }
}

export async function refresh(req: Request, res: Response) {

    try {
        const tokenId = req.body.tokenId;

        if (!tokenId) {
            return res.status(400).json({
                message: "Token ID is not present"
            })
        }

        const newToken = await refreshToken(tokenId);

        return res.status(201).json({
            message: "New token issued successfully.",
            expiresAt: newToken.expiresAt,
            token: newToken.id
        })

    } catch (error) {

        console.error("Refresh Error:", error)

        return res.status(400).json({
            message: error instanceof Error
                ? error.message
                : "Token refresh failed"
        })
    }
}

export async function revoke(req: Request, res: Response) {

    try {
        const tokenId = req.body.tokenId;

        if (!tokenId) {
            return res.status(400).json({
                message: "Token ID is not present"
            })
        }

        const revokedToken = await revokeToken(tokenId)

        return res.status(200).json({
            message: "Token Revoked Successfully",
            tokenId: revokedToken.id
        })

    } catch (error) {

        console.error("Revoke Error:", error)

        return res.status(400).json({
            message: error instanceof Error
                ? error.message
                : "Token revocation failed"
        })
    }
}