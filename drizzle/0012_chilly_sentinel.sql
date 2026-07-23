ALTER TABLE "users"
  ALTER COLUMN "birthday" SET DATA TYPE text
  USING CASE
    WHEN "birthday" IS NULL THEN NULL
    ELSE to_char("birthday", 'MM-DD')
  END;
