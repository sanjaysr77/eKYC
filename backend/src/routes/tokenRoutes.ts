
import express from "express";
import { tokenIssuance, validate } from "../controllers/tokenController.js";

const router = express.Router()

router.post("/issuance", tokenIssuance)
router.post("/validate", validate)

export default router;