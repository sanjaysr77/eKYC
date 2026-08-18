
import express from "express";
import { submitConsent } from "../controllers/consentController.js";

const router = express.Router()

router.post("/", submitConsent)

export default router;