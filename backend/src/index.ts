import 'dotenv/config'
import { PrismaClient } from "@prisma/client/index"
import { PrismaPg } from '@prisma/adapter-pg'
import express from 'express'

const pool = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter: pool })

const app = express()

app.use(express.json())

app.post("/token", async (req, res) => {
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
});

app.listen(3000, () => {
  console.log("Running on PORT 3000")
})