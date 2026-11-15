-- DBA: apply only after the service_reviews migration, never from API startup.
IF DB_NAME() <> N'OminiDB' THROW 50000, 'Select OminiDB.', 1;
IF DATABASE_PRINCIPAL_ID(N'omini_runtime_role') IS NULL THROW 50001, 'Runtime role is missing.', 1;
IF OBJECT_ID(N'[dbo].[ServiceReview]', N'U') IS NULL THROW 50002, 'Apply the reviews migration first.', 1;
GRANT SELECT, INSERT ON OBJECT::[dbo].[ServiceReview] TO [omini_runtime_role];
-- No UPDATE/DELETE: published reviews are append-only to the runtime identity.
