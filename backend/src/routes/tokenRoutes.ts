
import express from "express";
import { refresh, tokenIssuance, validate } from "../controllers/tokenController.js";

const router = express.Router()

router.post("/issuance", tokenIssuance)
router.post("/validate", validate)
router.post("/refresh", refresh)

export default router;