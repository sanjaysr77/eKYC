/*
  Warnings:

  - You are about to drop the `Token` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Token" DROP CONSTRAINT "Token_customerId_fkey";

-- DropTable
DROP TABLE "Token";

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
