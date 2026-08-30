import 'dotenv/config'
import { PrismaClient } from "@prisma/client/index"
import { PrismaPg } from '@prisma/adapter-pg'
import { type Request, type Response } from "express"
import { markExpiredToken } from '../services/tokenService.js'

const pool = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter: pool })

export async function tokenIssuance(req: Request, res: Response) {

    try {
        const customerId = req.body.customerId;

        if (!customerId) {
            return res.status(400).json({
                message: "Customer Id is not present"
            })
        }

        const customer = await prisma.customer.findUnique({
            where: { id: customerId },
            include: {
                consents: {
                    orderBy: { createdAt: "desc" },
                    take: 1
                }
            }
        })

        if (!customer) {
            return res.status(404).json({
                message: "Customer is not found"
            })
        }

        if (!customer.verified) {
            return res.status(400).json({
                message: "Customer is not verified"
            })
        }

        const latestConsent = customer.consents[0];

        if (!latestConsent || !latestConsent.granted) {
            return res.status(400).json({
                message: "Consent not granted. Token cannot be generated",
                latestConsent
            })
        }

        const existingToken = await prisma.token.findFirst({
            where: {
                customerId,
            }
        })

        if (existingToken) {
            return res.status(400).json({
                message: "Token Already Exists. Try Refreshing",
                token: existingToken.id
            })
        }

        const expiresAt = new Date();

        expiresAt.setHours(expiresAt.getHours() + 1);

        const token = await prisma.token.create({
            data: {
                customerId: customer.id,
                consentId: latestConsent.id,
                expiresAt,
                status: "ACTIVE"
            }
        })

        return res.status(201).json({
            message: "Token issued successfully.",
            expiresAt: token.expiresAt,
            token: token.id
        })

    } catch (error) {
        console.error("Token Error:", error);

        return res.status(500).json({
            message: "Internal Server Error"
        })
    }
}

export async function validate(req: Request, res: Response) {
    try {
        const tokenId = req.body.token;

        if (!tokenId) {
            return res.status(400).json({
                message: "Token Id is not present"
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

        await markExpiredToken(customerId)

        const token = await prisma.token.findFirst({
            where: {
                id: tokenId,
                status: "ACTIVE"
            },
        })

        if (token) {
            return res.status(200).json({
                message: "Active Token exists",
                token
            })
        }

        else {
            return res.status(400).json({
                message: "Validation failed, ACTIVE Token does not exist."
            })
        }

    }

    catch (error) {
        console.error("Validation Error:", error);

        return res.status(500).json({
            message: "Internal Server Error"
        })
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

        console.log("customerId", customerId)

        const consent = await prisma.consent.findFirst({
            where: {
                customerId: customerId
            },
            orderBy: {
                createdAt: "desc"
            }

        })
        console.log("consent", consent);

        if (!consent) {
            return res.status(400).json({
                message: "Consent Id not found"
            })
        }

        if (!consent.granted) {
            return res.status(403).json({
                message: "Consent not granted. Cannot refresh token."
            })
        }

        const result = await markExpiredToken(customerId)

        if (!result) {
            return res.status(400).json({
                message: "Active Token Exists"
            })
        }

        const expiresAt = new Date();

        expiresAt.setHours(expiresAt.getHours() + 1);

        console.log("Customer ID", customerId)
        console.log("Consent ID", consent.id)

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