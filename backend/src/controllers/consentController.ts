import 'dotenv/config'
import { PrismaClient } from "@prisma/client/index"
import { PrismaPg } from '@prisma/adapter-pg'
import { type Request, type Response } from "express"
import { verifyAadhaar } from "../services/aadhaarVerificationService.js"
import { recordConsentOnFabric, withdrawConsentOnFabric } from '../services/fabricService.js'

const pool = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter: pool })

export async function submitConsent(req: Request, res: Response) {
  const { aadhaar, consent } = req.body;

  if (typeof aadhaar !== "string" || !/^\d{12}$/.test(aadhaar)) {
    return res.status(400).json({
      message: "A valid 12-digit Aadhaar value is required."
    });
  }

  if (consent !== "GIVEN") {
    return res.status(400).json({
      message: "Consent must be GIVEN during initial customer creation."
    });
  }

  try {

    const verificationResult = await verifyAadhaar(aadhaar);

    if (!verificationResult.verified) {
      return res.status(400).json({
        error: "Aadhaar verification failed",
        message: verificationResult.message,
        verificationId: verificationResult.verificationId
      });
    }

    const existingCustomer = await prisma.customer.findUnique({
      where: { aadhaar }
    });

    if (existingCustomer) {
      return res.status(409).json({
        message: "Customer already exists."
      });
    }

    const customerId = crypto.randomUUID();
    const consentId = crypto.randomUUID();

    await recordConsentOnFabric(consentId, customerId);

    const customer = await prisma.customer.create({
      data: {
        id: customerId,
        aadhaar,
        verified: true,
        verificationId: verificationResult.verificationId
      }
    });

    const consentRecord = await prisma.consent.create({
      data: {
        id: consentId,
        customerId: customer.id,
        status: "GIVEN"
      }
    });

    return res.status(201).json({
      consent: consentRecord
    });

  } catch (err) {

    if (
      typeof err === "object" && err !== null && "code" in err && err.code === "P2002"
    ) {
      return res.status(409).json({
        message: "A customer with this Aadhaar already exists."
      });
    }

    console.error("Consent submission error:", err);

    return res.status(500).json({
      error: "Something went wrong"
    });
  }
}

export async function getConsentRecords(req: Request, res: Response) {

  try {
    const { customerId } = req.params;

    if (!customerId || Array.isArray(customerId)) {
      return res.status(400).json({
        message: "Invalid customer ID.",
      });
    }

    const consentRecords = await prisma.consent.findMany({
      where: {
        customerId,
      },
      orderBy: {
        createdAt: "desc",
      },
    })

    if (consentRecords.length === 0) {
      return res.status(404).json({
        message: "No consent records found."
      })
    }

    return res.status(200).json({
      customerId,
      consentRecords
    })
  }
  catch (error) {
    return res.status(500).json({
      message: "Internal Server Error.",
      error: error
    })
  }

}

export async function withdrawConsent(req: Request, res: Response) {
  try {
    const { customerId } = req.body;

    if (typeof customerId !== "string" || customerId.trim().length === 0) {
      return res.status(400).json({
        message: "A valid customer ID is required."
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

    const latestConsent = customer.consents[0];

    if (!latestConsent) {
      return res.status(404).json({
        message: "No consent record found"
      });
    }

    if (latestConsent.status === "WITHDRAWN") {
      return res.status(400).json({
        message: "Consent is already WITHDRAWN",
        consent: latestConsent.status
      });
    }

    try {
      await withdrawConsentOnFabric(latestConsent.id);
    } 
    catch (fabricError) {
      const message =
        fabricError instanceof Error ? fabricError.message : String(fabricError);

      if (message.includes("Consent is already WITHDRAWN")) {
        return res.status(409).json({
          message: "Consent is already withdrawn on Fabric."
        });
      }

      throw fabricError;
    }

    const consentRecord = await prisma.consent.create({
      data: {
        customerId: customer.id,
        status: "WITHDRAWN"
      }
    });

    return res.status(201).json({
      message: `Consent for Customer ID ${customer.id} is WITHDRAWN`,
      consent: consentRecord
    });

  } catch (err) {
    console.error("Consent Withdrawal Error:", err);

    return res.status(500).json({
      error: "Something went wrong"
    });
  }
}