/*
  Warnings:

  - A unique constraint covering the columns `[verificationId]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "verificationId" TEXT,
ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Customer_verificationId_key" ON "Customer"("verificationId");
