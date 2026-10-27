ALTER TABLE "classes" ADD COLUMN "level" smallint NOT NULL;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_level_check" CHECK ("level" BETWEEN 0 AND 13);