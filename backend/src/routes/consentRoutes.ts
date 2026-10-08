
import express from "express";
import { getConsentRecords, submitConsent, withdrawConsent } from "../controllers/consentController.js";

const router = express.Router()

router.post("/", submitConsent)
router.post("/withdraw", withdrawConsent)
router.get("/customer/:customerId", getConsentRecords)

export default router;