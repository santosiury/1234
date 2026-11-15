-- Additive only. No backfill, fabricated reputation or changes to completed requests.
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;
IF DB_NAME() <> N'OminiDB' THROW 50000, 'Expected OminiDB.', 1;
IF OBJECT_ID(N'[dbo].[ServiceRequest]', N'U') IS NULL THROW 50001, 'Apply previous phases first.', 1;
IF OBJECT_ID(N'[dbo].[ServiceReview]', N'U') IS NOT NULL THROW 50002, 'Review objects exist; inspect migration history.', 1;
CREATE TABLE [dbo].[ServiceReview] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ServiceReview_id_df] DEFAULT (newid()),
    [requestId] UNIQUEIDENTIFIER NOT NULL,
    [clientUserId] UNIQUEIDENTIFIER NOT NULL,
    [providerUserId] UNIQUEIDENTIFIER NOT NULL,
    [providerId] UNIQUEIDENTIFIER NOT NULL,
    [rating] INT NOT NULL,
    [comment] NVARCHAR(1000) NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ServiceReview_createdAt_df] DEFAULT (sysutcdatetime()),
    CONSTRAINT [ServiceReview_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ServiceReview_requestId_key] UNIQUE NONCLUSTERED ([requestId]),
    CONSTRAINT [ServiceReview_rating_check] CHECK ([rating] BETWEEN 1 AND 5),
    CONSTRAINT [ServiceReview_participants_check] CHECK ([clientUserId] <> [providerUserId])
);
CREATE NONCLUSTERED INDEX [ServiceReview_providerId_createdAt_id_idx] ON [dbo].[ServiceReview] ([providerId], [createdAt], [id]);
ALTER TABLE [dbo].[ServiceReview] ADD CONSTRAINT [ServiceReview_requestId_fkey] FOREIGN KEY ([requestId]) REFERENCES [dbo].[ServiceRequest] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[ServiceReview] ADD CONSTRAINT [ServiceReview_clientUserId_fkey] FOREIGN KEY ([clientUserId]) REFERENCES [dbo].[User] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[ServiceReview] ADD CONSTRAINT [ServiceReview_providerUserId_fkey] FOREIGN KEY ([providerUserId]) REFERENCES [dbo].[User] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE [dbo].[ServiceReview] ADD CONSTRAINT [ServiceReview_providerId_fkey] FOREIGN KEY ([providerId]) REFERENCES [dbo].[ProviderProfile] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;
COMMIT TRANSACTION;
END TRY
BEGIN CATCH
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
THROW;
END CATCH;
