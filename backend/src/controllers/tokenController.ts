
import 'dotenv/config'
import { PrismaClient } from "@prisma/client/index"
import { PrismaPg } from '@prisma/adapter-pg'
import { createUserRef, createRecordHash } from "../services/kycHashService.js";
import { issueTokenOnFabric } from "../services/fabricService.js";
import { type Request, type Response } from "express"
import { markExpiredToken } from '../services/tokenService.js'
import { validateTokenOnFabric } from "../services/fabricService.js";

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

        const existingToken = await prisma.token.findFirst({
            where: {
                customerId,
            }
        });

        if (existingToken) {
            return res.status(400).json({
                message: "Token Already Exists. Try Refreshing",
                token: existingToken.id
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

        return res.status(200).json({
            message: "Token is valid",
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

        const tokenQuery = await prisma.token.findUnique({
            where: {
                id: tokenId
            }
        })

        if (!tokenQuery) {
            return res.status(404).json({
                message: "Token not found"
            });
        }

        const customerId = tokenQuery.customerId;

        const customer = await prisma.customer.findUnique({
            where: { id: customerId }
        })

        if (!customer) {
            return res.status(404).json({
                message: "Customer not found"
            })
        }

        if (!customer.verified) {
            return res.status(400).json({
                message: "Customer is not verified"
            })
        }

        const consent = await prisma.consent.findFirst({
            where: {
                customerId: customerId
            },
            orderBy: {
                createdAt: "desc"
            }

        })

        if (!consent) {
            return res.status(400).json({
                message: "Consent Id not found"
            })
        }

        if (consent.status !== "GIVEN") {
            return res.status(403).json({
                message: "Consent not granted. Cannot refresh token."
            })
        }

        await markExpiredToken(customerId)

        const existingToken = await prisma.token.findFirst({
            where: {
                id: tokenId,
                status: "ACTIVE"
            },
        })

        if (existingToken) {
            return res.status(200).json({
                message: "Active Token exists",
                existingToken
            })
        }

        const expiresAt = new Date();

        expiresAt.setHours(expiresAt.getHours() + 1);

        const token = await prisma.token.create({
            data: {
                customerId: customerId,
                consentId: consent.id,
                expiresAt,
                status: "ACTIVE"
            }
        })

        return res.status(201).json({
            message: "New token issued successfully.",
            expiresAt: expiresAt,
            token: token.id
        })

    }
    catch (error) {
        console.error(error)
        return res.status(500).json({
            message: "Internal Server Error",
            error: error
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

        const token = await prisma.token.findUnique({
            where: {
                id: tokenId
            }
        })

        if (!token) {
            return res.status(404).json({
                message: "Token not found"
            })
        }

        await markExpiredToken(token.customerId);

        const refreshedToken = await prisma.token.findUnique({
            where: {
                id: tokenId
            }
        })

        if (refreshedToken!.status !== "ACTIVE") {
            return res.status(400).json({
                message: `Token is already ${refreshedToken!.status}`,
                currentStatus: refreshedToken!.status
            })
        }

        await prisma.token.update({
            where: {
                id: tokenId
            },
            data: {
                status: "REVOKED"
            }
        })

        return res.status(200).json({
            message: "Token Revoked Successfully",
            tokenId: tokenId
        })

    }
    catch (error) {
        console.error("Revoke Error", error)
        return res.status(500).json({
            message: "Internal Server Error",
            error: error
        })
    }
}