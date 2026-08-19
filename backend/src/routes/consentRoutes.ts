
import express from "express";
import { getConsentRecords, submitConsent } from "../controllers/consentController.js";

const router = express.Router()

router.post("/", submitConsent)
router.get("/customer/:customerId", getConsentRecords)

export default router;