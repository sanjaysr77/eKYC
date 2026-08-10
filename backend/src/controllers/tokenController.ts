import 'dotenv/config'
import { PrismaClient } from "@prisma/client/index"
import { PrismaPg } from '@prisma/adapter-pg'
import express, { type Request, type Response } from "express"

const pool = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter: pool })

const router = express.Router();

export async function token (req: Request, res: Response) {
    const { aadhaar, consent } = req.body;

  try {
    let customer = await prisma.customer.findUnique({
      where: { aadhaar }
    });

    if (!customer) {
      customer = await prisma.customer.create({
        data: { aadhaar }
      });
    }

    const token = await prisma.token.create({
      data: {
        customerId: customer.id,
        consent
      }
    });

    return res.status(201).json({ token });

  } catch (err) {
    console.error("Server Error", err);

    return res.status(500).json({
      error: "Something went wrong"
    });
  }
};
  

export default router;