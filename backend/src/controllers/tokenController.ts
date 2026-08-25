import 'dotenv/config'
import { PrismaClient } from "@prisma/client/index"
import { PrismaPg } from '@prisma/adapter-pg'
import express, { type Request, type Response } from "express"

const pool = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter: pool })

const router = express.Router();

export async function token(req: Request, res: Response) {

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
                message: "Consent not granted. Token cannot be generated"
            })
        }

        const expiredToken = await prisma.token.findFirst({
            where: {
                customerId,
                status: "ACTIVE",
                expiresAt: {
                    lte: new Date()
                }
            }
        })

        if (expiredToken) {
            await prisma.token.update({
                where: {
                    id: expiredToken.id
                },
                data: {
                    status: "EXPIRED"
                }
            })
        }

        const activeToken = await prisma.token.findFirst({
            where: {
                customerId: customerId,
                status: "ACTIVE",
                expiresAt: {
                    gt: new Date(),
                }
            },
        })

        if (activeToken) {
            return res.status(200).json({
                message: "Active token already exists",
                token: activeToken.id,
                expiresAt: activeToken.expiresAt
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

        return res.status(200).json({
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

export default router;