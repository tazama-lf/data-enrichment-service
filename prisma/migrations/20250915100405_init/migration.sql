-- CreateTable
CREATE TABLE "public"."Job" (
    "id" SERIAL NOT NULL,
    "sourcePath" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "fileFormat" TEXT NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);
