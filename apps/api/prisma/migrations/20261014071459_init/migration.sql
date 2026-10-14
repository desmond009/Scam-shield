-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ANALYST', 'ADMIN');

-- CreateEnum
CREATE TYPE "TxnStatus" AS ENUM ('PENDING', 'BLOCKED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TxnLabel" AS ENUM ('FRAUD', 'SAFE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "Band" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'REVIEWED');

-- CreateEnum
CREATE TYPE "AlertOutcome" AS ENUM ('FRAUD', 'SAFE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "upiId" TEXT NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceHash" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payee" (
    "id" TEXT NOT NULL,
    "upiId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "reputationScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confirmedFraudAt" TIMESTAMP(3),

    CONSTRAINT "Payee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payeeUpiId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "status" "TxnStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "deviceHash" TEXT,
    "ip" TEXT,
    "isSynthetic" BOOLEAN NOT NULL DEFAULT false,
    "label" "TxnLabel" NOT NULL DEFAULT 'UNKNOWN',

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskDecision" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "ruleScore" DOUBLE PRECISION NOT NULL,
    "mlScore" DOUBLE PRECISION,
    "finalScore" DOUBLE PRECISION NOT NULL,
    "preContextScore" DOUBLE PRECISION,
    "band" "Band" NOT NULL,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "reasons" JSONB NOT NULL,
    "features" JSONB NOT NULL,
    "mlTopFeatures" JSONB,
    "degraded" BOOLEAN NOT NULL DEFAULT false,
    "modelVersion" TEXT,
    "latencyMs" DOUBLE PRECISION NOT NULL,
    "contextAnswers" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "analystId" TEXT,
    "outcome" "AlertOutcome",
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleConfig" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "params" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RuleConfig_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PayeeReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "payeeUpiId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayeeReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "meta" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelRun" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "metrics" JSONB NOT NULL,
    "trainedAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ModelRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_upiId_key" ON "User"("upiId");

-- CreateIndex
CREATE UNIQUE INDEX "Payee_upiId_key" ON "Payee"("upiId");

-- CreateIndex
CREATE INDEX "Transaction_userId_createdAt_idx" ON "Transaction"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_payeeUpiId_createdAt_idx" ON "Transaction"("payeeUpiId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_userId_idempotencyKey_key" ON "Transaction"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "LedgerEntry_userId_createdAt_idx" ON "LedgerEntry"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RiskDecision_transactionId_key" ON "RiskDecision"("transactionId");

-- CreateIndex
CREATE INDEX "RiskDecision_band_createdAt_idx" ON "RiskDecision"("band", "createdAt");

-- CreateIndex
CREATE INDEX "RiskDecision_createdAt_idx" ON "RiskDecision"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_decisionId_key" ON "Alert"("decisionId");

-- CreateIndex
CREATE INDEX "Alert_status_createdAt_idx" ON "Alert"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PayeeReport_payeeUpiId_idx" ON "PayeeReport"("payeeUpiId");

-- CreateIndex
CREATE UNIQUE INDEX "PayeeReport_reporterId_payeeUpiId_key" ON "PayeeReport"("reporterId", "payeeUpiId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModelRun_version_key" ON "ModelRun"("version");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskDecision" ADD CONSTRAINT "RiskDecision_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "RiskDecision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_analystId_fkey" FOREIGN KEY ("analystId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayeeReport" ADD CONSTRAINT "PayeeReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
