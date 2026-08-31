
import express from "express";
import { refresh, revoke, tokenIssuance, validate } from "../controllers/tokenController.js";

const router = express.Router()

router.post("/issuance", tokenIssuance);
router.post("/validate", validate);
router.post("/refresh", refresh);
router.post("/revoke", revoke);

export default router;