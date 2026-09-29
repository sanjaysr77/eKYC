import 'dotenv/config'

import { PrismaClient } from "@prisma/client/index"
import { PrismaPg } from '@prisma/adapter-pg'
import { expireTokenOnFabric } from './fabricService.js'

const pool = new PrismaPg({ connectionString: process.env.DATABASE_URL! })

const prisma = new PrismaClient({ adapter: pool })

export async function expireToken(tokenId: string) {

    const token = await prisma.token.findUnique({
        where: {
            id: tokenId
        }
    })

    if (!token) {
        throw new Error("Token not found")
    }

    if (token.status !== "ACTIVE") {
        throw new Error(`Token is already ${token.status}`)
    }

    if (token.expiresAt > new Date()) {
        throw new Error("Token has not expired yet")
    }

    await expireTokenOnFabric(tokenId)

    await prisma.token.update({
        where: {
            id: tokenId
        },
        data: {
            status: "EXPIRED"
        }
    })
}