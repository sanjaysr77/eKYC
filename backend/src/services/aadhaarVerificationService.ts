export interface AadhaarVerificationResponse {
  verified: boolean;
  verificationId: string;
  aadhaar: string;
  timestamp: string;
  message: string;
}

export async function verifyAadhaar(aadhaar: string): Promise<AadhaarVerificationResponse> {
 
  await new Promise(resolve => setTimeout(resolve, 500));

  if (!/^\d{12}$/.test(aadhaar)) {
    return {
      verified: false,
      verificationId: generateVerificationId(),
      aadhaar,
      timestamp: new Date().toISOString(),
      message: "Invalid Aadhaar format. Must be 12 digits."
    };
  }

  const isValid = !aadhaar.endsWith('0');

  return {
    verified: isValid,
    verificationId: generateVerificationId(),
    aadhaar,
    timestamp: new Date().toISOString(),
    message: isValid ? "Aadhaar verified successfully" : "Aadhaar verification failed"
  };
}

function generateVerificationId(): string {
  return `VERIFY_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
