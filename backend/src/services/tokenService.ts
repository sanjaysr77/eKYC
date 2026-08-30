import 'dotenv/config'
import { PrismaClient } from "@prisma/client/index"
import { PrismaPg } from '@prisma/adapter-pg'

const pool = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter: pool })

export async function markExpiredToken(customerId: string) {
    const result = await prisma.token.updateMany({  // updateMany instead of update
        where: {
            customerId,
            status: "ACTIVE",
            expiresAt: {
                lte: new Date()
            }
        },
        data: {
            status: "EXPIRED"
        }
    })

    return result.count > 0;
}
