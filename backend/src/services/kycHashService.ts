import crypto from "node:crypto";

export function createUserRef(recordIdentifier: string): string {
    const hash = crypto.createHash("sha256");

    hash.update(recordIdentifier);

    const result = hash.digest("hex");

    return result;
}

export function createRecordHash(record: {
    verificationId: string;
    verified: boolean;
    createdAt: Date;
}): string {

    const recordData = {
        verificationId: record.verificationId,
        verified: record.verified,
        createdAt: record.createdAt.toISOString(),
    };

    const canonicalRecord = JSON.stringify(recordData);

    const hash = crypto.createHash("sha256");

    hash.update(canonicalRecord);

    const result = hash.digest("hex");

    return result;
}
