import {
  connect,
  type Contract,
  type Gateway,
  type Network,
} from "@hyperledger/fabric-gateway";

import * as grpc from "@grpc/grpc-js";
import { signers } from "@hyperledger/fabric-gateway";
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

const CHANNEL_NAME = "kyctokenchannel";
const CHAINCODE_NAME = "kyc-token-cc";
const MSP_ID = "Org1MSP";

const FABRIC_DIR = path.resolve(process.cwd(), "../fabric");

const CERT_PATH = path.join(
  FABRIC_DIR,
  "organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/signcerts"
);

const KEY_PATH = path.join(
  FABRIC_DIR,
  "organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp/keystore"
);

const TLS_CERT_PATH = path.join(
  FABRIC_DIR,
  "organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
);

async function getSingleFile(directory: string): Promise<string> {
  const files = await fs.readdir(directory);

  if (files.length !== 1) {
    throw new Error(
      `Expected exactly one file in ${directory}, found ${files.length}`
    );
  }

  return path.join(directory, files[0]);
}

async function createGateway(): Promise<{
  gateway: Gateway;
  network: Network;
  contract: Contract;
}> {
  const certificatePath = await getSingleFile(CERT_PATH);
  const privateKeyPath = await getSingleFile(KEY_PATH);

  const certificate = await fs.readFile(certificatePath);
  const privateKeyPem = await fs.readFile(privateKeyPath);
  const tlsRootCert = await fs.readFile(TLS_CERT_PATH);

  const privateKey = crypto.createPrivateKey(privateKeyPem);

  const client = new grpc.Client(
    "localhost:7051",
    grpc.credentials.createSsl(tlsRootCert),
    {
      "grpc.ssl_target_name_override": "peer0.org1.example.com",
      "grpc.default_authority": "peer0.org1.example.com",
    }
  );

  const gateway = connect({
    client,

    identity: {
      mspId: MSP_ID,
      credentials: certificate,
    },

    signer: signers.newPrivateKeySigner(privateKey),

    evaluateOptions: () => ({
      deadline: Date.now() + 5000,
    }),

    endorseOptions: () => ({
      deadline: Date.now() + 15000,
    }),

    submitOptions: () => ({
      deadline: Date.now() + 15000,
    }),

    commitStatusOptions: () => ({
      deadline: Date.now() + 60000,
    }),
  });

  const network = gateway.getNetwork(CHANNEL_NAME);

  const contract = network.getContract(CHAINCODE_NAME);

  return {
    gateway,
    network,
    contract,
  };
}

export async function recordConsentOnFabric(
  consentId: string,
  customerId: string
): Promise<string> {
  const { gateway, contract } = await createGateway();

  try {
    const result = await contract.submitTransaction(
      "RecordConsent",
      consentId,
      customerId,
      "GIVEN"
    );

    return result.toString();
  } finally {
    gateway.close();
  }
}

export async function issueTokenOnFabric(
  tokenId: string,
  userRef: string,
  customerId: string,
  consentId: string,
  recordHash: string,
  expiresAt: string
): Promise<string> {
  const { gateway, contract } = await createGateway();

  try {
    const result = await contract.submitTransaction(
      "IssueToken",
      tokenId,
      userRef,
      customerId,
      consentId,
      recordHash,
      expiresAt,
    );

    return result.toString();
  } finally {
    gateway.close();
  }
}

export async function validateTokenOnFabric(
  tokenId: string
): Promise<string> {
  const { gateway, contract } = await createGateway();

  try {
    const result = await contract.submitTransaction(
      "ValidateToken",
      tokenId
    );

    return Buffer.from(result).toString("utf8");
  } finally {
    gateway.close();
  }
}