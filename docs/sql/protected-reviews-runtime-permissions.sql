-- PREPARED ONLY. DBA executes only after separate authorization of the isolated test migration.
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;
IF DB_NAME() <> N'OminiDB' THROW 50000, 'Select OminiDB.', 1;
IF COALESCE(CONVERT(INT, CONNECTIONPROPERTY('local_tcp_port')),0) <> 15433 THROW 50001, 'Only isolated test port 15433.', 1;
IF DATABASE_PRINCIPAL_ID(N'omini_runtime_role') IS NULL THROW 50002, 'Runtime role is missing.', 1;
IF OBJECT_ID(N'[dbo].[ParticipantReview]', N'U') IS NULL THROW 50003, 'Apply authorized protected reviews migration first.', 1;
GRANT SELECT, INSERT ON OBJECT::[dbo].[ReviewWindow] TO [omini_runtime_role];
GRANT UPDATE ON OBJECT::[dbo].[ReviewWindow] ([releasedAt]) TO [omini_runtime_role];
GRANT SELECT, INSERT ON OBJECT::[dbo].[ParticipantReview] TO [omini_runtime_role];
GRANT UPDATE ON OBJECT::[dbo].[ParticipantReview] ([publishedAt], [batchId]) TO [omini_runtime_role];
GRANT SELECT, INSERT ON OBJECT::[dbo].[ReputationBatch] TO [omini_runtime_role];
-- No UPDATE of ratings/comments/identities/windows, no DELETE, no broad database roles.
COMMIT TRANSACTION;
END TRY
BEGIN CATCH
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
THROW;
END CATCH;
