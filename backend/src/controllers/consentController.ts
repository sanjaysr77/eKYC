import 'dotenv/config'
import { PrismaClient } from "@prisma/client/index"
import { PrismaPg } from '@prisma/adapter-pg'
import express, { type Request, type Response } from "express"
import { verifyAadhaar } from "../services/aadhaarVerificationService.js"

const pool = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter: pool })

const router = express.Router();

export async function submitConsent (req: Request, res: Response) {
    const { aadhaar, consent } = req.body;

  try {
    
    const verificationResult = await verifyAadhaar(aadhaar);

    if (!verificationResult.verified) {
      return res.status(400).json({
        error: "Aadhaar verification failed",
        message: verificationResult.message,
        verificationId: verificationResult.verificationId
      });
    }

    let customer = await prisma.customer.findUnique({
      where: { aadhaar }
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          aadhaar,
          verified: true,
          verificationId: verificationResult.verificationId
        }
      });
    }

    const consentRecord = await prisma.consent.create({
      data: {
        customerId: customer.id,
        granted: consent
      }
    });

    return res.status(201).json({ consent: consentRecord });

  } catch (err) {
    console.error("Server Error", err);

    return res.status(500).json({
      error: "Something went wrong"
    });
  }
};
  

export default router;