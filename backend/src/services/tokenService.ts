import 'dotenv/config'
import { PrismaClient } from "@prisma/client/index"
import { PrismaPg } from '@prisma/adapter-pg'

const pool = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter: pool })

export async function markExpiredToken( customerId: string ) {

    const expiredToken = await prisma.token.findFirst({
        where: {
            customerId,
            status: "ACTIVE",
            expiresAt: {
                lte: new Date()
            }
        },
        orderBy: {
            createdAt: "desc"
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
}