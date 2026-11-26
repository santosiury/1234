-- READ ONLY. Execute only after separate authorization to access OMINI_TEST.
SET NOCOUNT ON;
IF DB_NAME() <> N'OminiDB' THROW 50300, 'Expected OminiDB.', 1;
IF COALESCE(CONVERT(INT, CONNECTIONPROPERTY('local_tcp_port')),0) <> 15433 THROW 50301, 'Only isolated TCP port 15433.', 1;
IF ORIGINAL_LOGIN() <> N'omini_migrator' THROW 50302, 'Use the dedicated test migration identity.', 1;
IF OBJECT_ID(N'dbo._prisma_migrations',N'U') IS NULL THROW 50303, 'Migration history missing.', 1;
IF EXISTS (SELECT 1 FROM dbo._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL) THROW 50304, 'Incomplete migration: stop and review.', 1;
IF (SELECT COUNT(*) FROM dbo._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 6 THROW 50305, 'Expected exactly six applied historical migrations.', 1;
IF EXISTS (
 SELECT name FROM (VALUES
 (N'20261109000000_persistence_foundation'),(N'20261110000000_authentication'),
 (N'20261112000000_service_requests'),(N'20261115000000_customer_contact'),
 (N'20261115010000_service_reviews'),(N'20261123000000_unilateral_cancellation')
 ) required(name)
 EXCEPT SELECT migration_name FROM dbo._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
) THROW 50306, 'Applied migration names differ from the reviewed base.', 1;
IF OBJECT_ID(N'dbo.ReviewWindow',N'U') IS NOT NULL OR OBJECT_ID(N'dbo.ParticipantReview',N'U') IS NOT NULL OR OBJECT_ID(N'dbo.ReputationBatch',N'U') IS NOT NULL OR OBJECT_ID(N'dbo.ServiceReview_protected_cutover',N'TR') IS NOT NULL THROW 50307, 'Protected objects already exist: do not retry blindly.', 1;
IF COALESCE(HAS_PERMS_BY_NAME(DB_NAME(),N'DATABASE',N'CREATE TABLE'),0)<>1 OR COALESCE(HAS_PERMS_BY_NAME(N'dbo',N'SCHEMA',N'ALTER'),0)<>1 THROW 50308, 'Required scoped DDL permissions missing.', 1;
SELECT DB_NAME() AS databaseName,CONNECTIONPROPERTY('local_tcp_port') AS port,ORIGINAL_LOGIN() AS loginName;
SELECT migration_name,checksum,finished_at,rolled_back_at FROM dbo._prisma_migrations ORDER BY started_at;
SELECT (SELECT COUNT_BIG(*) FROM dbo.[User]) AS users,
 (SELECT COUNT_BIG(*) FROM dbo.ServiceCategory) AS categories,
 (SELECT COUNT_BIG(*) FROM dbo.ServiceRequest) AS requests,
 (SELECT COUNT_BIG(*) FROM dbo.ServiceRequestEvent) AS requestEvents,
 (SELECT COUNT_BIG(*) FROM dbo.ServiceReview) AS historicalReviews;
-- Save counts/checksums outside Git and obtain a DBA-verified backup before deployment.
