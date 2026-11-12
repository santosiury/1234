-- DBA review only, AFTER the incremental service_requests migration. Never startup SQL.
IF DB_NAME() <> N'OminiDB' THROW 50000, 'Select OminiDB.', 1;
IF DATABASE_PRINCIPAL_ID(N'omini_runtime_role') IS NULL THROW 50001, 'Runtime role is missing.', 1;
IF OBJECT_ID(N'[dbo].[ServiceRequest]', N'U') IS NULL THROW 50002, 'Review/apply the request migration first.', 1;
IF OBJECT_ID(N'[dbo].[ServiceRequestEvent]', N'U') IS NULL THROW 50002, 'Review/apply the request migration first.', 1;
GRANT SELECT, INSERT ON OBJECT::[dbo].[ServiceRequest] TO [omini_runtime_role];
-- Participants, service, snapshots, description, location and creation identity are immutable to runtime UPDATE.
GRANT UPDATE ON OBJECT::[dbo].[ServiceRequest] ([status], [updatedAt], [acceptedAt], [startedAt], [completionProposedAt], [completedAt], [cancelledAt], [version]) TO [omini_runtime_role];
-- Append-only audit, including idempotency receipts: no UPDATE or DELETE.
GRANT SELECT, INSERT ON OBJECT::[dbo].[ServiceRequestEvent] TO [omini_runtime_role];
