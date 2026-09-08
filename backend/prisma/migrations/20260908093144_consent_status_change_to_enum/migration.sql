-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GIVEN', 'WITHDRAWN');

-- Remove the existing default before changing the type
ALTER TABLE "Consent"
ALTER COLUMN "status" DROP DEFAULT;

-- Convert the existing status column
ALTER TABLE "Consent"
ALTER COLUMN "status" TYPE "ConsentStatus"
USING (
  CASE
    WHEN "granted" = true THEN 'GIVEN'::"ConsentStatus"
    ELSE 'WITHDRAWN'::"ConsentStatus"
  END
);

-- Remove the old boolean column
ALTER TABLE "Consent"
DROP COLUMN "granted";