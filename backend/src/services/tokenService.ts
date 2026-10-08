import 'dotenv/config'

import { PrismaClient } from "@prisma/client/index"
import { PrismaPg } from '@prisma/adapter-pg'
import crypto from "node:crypto"
import { expireTokenOnFabric, refreshTokenOnFabric, revokeTokenOnFabric } from "../services/fabricService.js";

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

export async function refreshToken(tokenId: string) {

    const token = await prisma.token.findUnique({
        where: {
            id: tokenId
        }
    })

    if (!token) {
        throw new Error("Token not found")
    }

    if (token.status !== "EXPIRED") {
        throw new Error(`Token is ${token.status}. Only expired tokens can be refreshed`)
    }

    const consent = await prisma.consent.findUnique({
        where: {
            id: token.consentId
        }
    })

    if (!consent) {
        throw new Error("Consent not found")
    }

    if (consent.status !== "GIVEN") {
        throw new Error("Consent not granted. Cannot refresh token.")
    }

    const newTokenId = crypto.randomUUID()

    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 1)

    await refreshTokenOnFabric(
        tokenId,
        newTokenId,
        expiresAt.toISOString()
    )

    const newToken = await prisma.token.create({
        data: {
            id: newTokenId,
            customerId: token.customerId,
            consentId: token.consentId,
            status: "ACTIVE",
            expiresAt
        }
    })

    return newToken
}

export async function revokeToken(tokenId: string) {

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

    await revokeTokenOnFabric(tokenId)

    const revokedToken = await prisma.token.update({
        where: {
            id: tokenId
        },
        data: {
            status: "REVOKED"
        }
    })

    return revokedToken
}