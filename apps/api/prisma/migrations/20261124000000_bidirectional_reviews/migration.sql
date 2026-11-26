-- Phase 2.6: PREPARED ONLY. Isolated test migration requires separate authorization.
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;
IF DB_NAME() <> N'OminiDB' THROW 50000, 'Expected OminiDB.', 1;
IF COALESCE(CONVERT(INT, CONNECTIONPROPERTY('local_tcp_port')),0) <> 15433 THROW 50001, 'Only isolated TCP port 15433 is authorized.', 1;
IF OBJECT_ID(N'[dbo].[ReviewWindow]', N'U') IS NOT NULL THROW 50002, 'Review migration history before retrying.', 1;
CREATE TABLE [dbo].[ReviewWindow] (
  [requestId] UNIQUEIDENTIFIER NOT NULL,
  [completedAt] DATETIME2 NOT NULL,
  [closesAt] DATETIME2 NOT NULL,
  [releasedAt] DATETIME2 NULL,
  CONSTRAINT [ReviewWindow_pkey] PRIMARY KEY CLUSTERED ([requestId]),
  CONSTRAINT [ReviewWindow_dates_check] CHECK ([closesAt]=DATEADD(DAY,14,[completedAt]) AND ([releasedAt] IS NULL OR [releasedAt]>=[completedAt]))
);
IF OBJECT_ID(N'[dbo].[ParticipantReview]', N'U') IS NOT NULL THROW 50002, 'Review migration history before retrying.', 1;
CREATE TABLE [dbo].[ParticipantReview] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ParticipantReview_id_df] DEFAULT (newid()),
  [requestId] UNIQUEIDENTIFIER NOT NULL,
  [direction] NVARCHAR(24) NOT NULL,
  [authorUserId] UNIQUEIDENTIFIER NOT NULL,
  [subjectUserId] UNIQUEIDENTIFIER NOT NULL,
  [rating] INT NOT NULL,
  [comment] NVARCHAR(1000) NULL,
  [submittedAt] DATETIME2 NOT NULL CONSTRAINT [ParticipantReview_submittedAt_df] DEFAULT (sysutcdatetime()),
  [publishedAt] DATETIME2 NULL,
  [isLegacy] BIT NOT NULL CONSTRAINT [ParticipantReview_isLegacy_df] DEFAULT (0),
  [batchId] UNIQUEIDENTIFIER NULL,
  CONSTRAINT [ParticipantReview_pkey] PRIMARY KEY CLUSTERED ([id]),
  CONSTRAINT [ParticipantReview_requestId_direction_key] UNIQUE NONCLUSTERED ([requestId], [direction]),
  CONSTRAINT [ParticipantReview_identity_check] CHECK ([authorUserId]<>[subjectUserId] AND [direction] IN (N'CLIENT_TO_PROVIDER',N'PROVIDER_TO_CLIENT')),
  CONSTRAINT [ParticipantReview_rating_check] CHECK ([rating] BETWEEN 1 AND 5),
  CONSTRAINT [ParticipantReview_publication_check] CHECK (([publishedAt] IS NULL AND [batchId] IS NULL AND [isLegacy]=0) OR ([publishedAt] IS NOT NULL AND [publishedAt]>=[submittedAt]))
);
IF OBJECT_ID(N'[dbo].[ReputationBatch]', N'U') IS NOT NULL THROW 50002, 'Review migration history before retrying.', 1;
CREATE TABLE [dbo].[ReputationBatch] (
  [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ReputationBatch_id_df] DEFAULT (newid()),
  [subjectUserId] UNIQUEIDENTIFIER NOT NULL,
  [direction] NVARCHAR(24) NOT NULL,
  [entryCount] INT NOT NULL,
  [distinctAuthorCount] INT NOT NULL,
  [createdAt] DATETIME2 NOT NULL CONSTRAINT [ReputationBatch_createdAt_df] DEFAULT (sysutcdatetime()),
  CONSTRAINT [ReputationBatch_pkey] PRIMARY KEY CLUSTERED ([id]),
  CONSTRAINT [ReputationBatch_id_subjectUserId_direction_key] UNIQUE NONCLUSTERED ([id], [subjectUserId], [direction]),
  CONSTRAINT [ReputationBatch_privacy_check] CHECK ([direction] IN (N'CLIENT_TO_PROVIDER',N'PROVIDER_TO_CLIENT') AND [distinctAuthorCount]>=5 AND [entryCount]>=[distinctAuthorCount])
);
ALTER TABLE [dbo].[ReviewWindow] ADD CONSTRAINT [ReviewWindow_requestId_fkey] FOREIGN KEY ([requestId]) REFERENCES [dbo].[ServiceRequest] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[ParticipantReview] ADD CONSTRAINT [ParticipantReview_requestId_fkey] FOREIGN KEY ([requestId]) REFERENCES [dbo].[ServiceRequest] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[ParticipantReview] ADD CONSTRAINT [ParticipantReview_authorUserId_fkey] FOREIGN KEY ([authorUserId]) REFERENCES [dbo].[User] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[ParticipantReview] ADD CONSTRAINT [ParticipantReview_subjectUserId_fkey] FOREIGN KEY ([subjectUserId]) REFERENCES [dbo].[User] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[ParticipantReview] ADD CONSTRAINT [ParticipantReview_batchId_subjectUserId_direction_fkey] FOREIGN KEY ([batchId], [subjectUserId], [direction]) REFERENCES [dbo].[ReputationBatch] ([id], [subjectUserId], [direction]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[ReputationBatch] ADD CONSTRAINT [ReputationBatch_subjectUserId_fkey] FOREIGN KEY ([subjectUserId]) REFERENCES [dbo].[User] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
CREATE NONCLUSTERED INDEX [ReviewWindow_releasedAt_closesAt_requestId_idx] ON [dbo].[ReviewWindow] ([releasedAt], [closesAt], [requestId]);
CREATE NONCLUSTERED INDEX [ParticipantReview_subjectUserId_direction_batchId_publishedAt_id_idx] ON [dbo].[ParticipantReview] ([subjectUserId], [direction], [batchId], [publishedAt], [id]);
CREATE NONCLUSTERED INDEX [ReputationBatch_subjectUserId_direction_idx] ON [dbo].[ReputationBatch] ([subjectUserId], [direction]);
-- Compile new-table references only after their DDL, inside the same transaction.
EXEC sys.sp_executesql N'
INSERT INTO [dbo].[ParticipantReview] ([id], [requestId], [direction], [authorUserId], [subjectUserId], [rating], [comment], [submittedAt], [publishedAt], [isLegacy], [batchId])
SELECT [id], [requestId], N''CLIENT_TO_PROVIDER'', [clientUserId], [providerUserId], [rating], [comment], [createdAt], [createdAt], 1, NULL FROM [dbo].[ServiceReview] WITH (TABLOCKX,HOLDLOCK);
IF (SELECT COUNT_BIG(*) FROM [dbo].[ParticipantReview] WHERE [isLegacy]=1) <> (SELECT COUNT_BIG(*) FROM [dbo].[ServiceReview]) THROW 50003, ''Legacy copy verification failed.'', 1;
';
-- Fail closed: a pre-cutover API must not publish unprotected reviews after this migration.
EXEC sys.sp_executesql N'CREATE TRIGGER [dbo].[ServiceReview_protected_cutover] ON [dbo].[ServiceReview] INSTEAD OF INSERT AS BEGIN SET NOCOUNT ON; THROW 50004, ''Protected review cutover required.'', 1; END';
COMMIT TRANSACTION;
END TRY
BEGIN CATCH
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
THROW;
END CATCH;
