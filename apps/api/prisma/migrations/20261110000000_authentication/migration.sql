-- Incremental authentication structures; preserves all six existing business tables.
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;
IF DB_NAME() <> N'OminiDB' THROW 50000, 'Expected OminiDB.', 1;
IF OBJECT_ID(N'[dbo].[User]', N'U') IS NULL THROW 50001, 'Phase 2.1 must be applied first.', 1;
IF OBJECT_ID(N'[dbo].[AuthCredential]', N'U') IS NOT NULL THROW 50002, 'Authentication objects exist; review migration history.', 1;
IF OBJECT_ID(N'[dbo].[AuthSession]', N'U') IS NOT NULL THROW 50002, 'Authentication objects exist; review migration history.', 1;
IF OBJECT_ID(N'[dbo].[RefreshToken]', N'U') IS NOT NULL THROW 50002, 'Authentication objects exist; review migration history.', 1;

CREATE TABLE [dbo].[AuthCredential] (
    [userId] UNIQUEIDENTIFIER NOT NULL,
    [emailNormalized] NVARCHAR(254) NOT NULL,
    [passwordHash] NVARCHAR(255) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AuthCredential_createdAt_df] DEFAULT (sysutcdatetime()),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [AuthCredential_updatedAt_df] DEFAULT (sysutcdatetime()),
    CONSTRAINT [AuthCredential_pkey] PRIMARY KEY CLUSTERED ([userId]),
    CONSTRAINT [AuthCredential_emailNormalized_key] UNIQUE NONCLUSTERED ([emailNormalized])
);

CREATE TABLE [dbo].[AuthSession] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [AuthSession_id_df] DEFAULT (newid()),
    [userId] UNIQUEIDENTIFIER NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AuthSession_createdAt_df] DEFAULT (sysutcdatetime()),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [AuthSession_updatedAt_df] DEFAULT (sysutcdatetime()),
    [expiresAt] DATETIME2 NOT NULL,
    [revokedAt] DATETIME2 NULL,
    CONSTRAINT [AuthSession_pkey] PRIMARY KEY CLUSTERED ([id])
);

CREATE TABLE [dbo].[RefreshToken] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [RefreshToken_id_df] DEFAULT (newid()),
    [sessionId] UNIQUEIDENTIFIER NOT NULL,
    [tokenHash] CHAR(64) NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [RefreshToken_createdAt_df] DEFAULT (sysutcdatetime()),
    [expiresAt] DATETIME2 NOT NULL,
    [consumedAt] DATETIME2 NULL,
    CONSTRAINT [RefreshToken_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [RefreshToken_tokenHash_key] UNIQUE NONCLUSTERED ([tokenHash])
);

CREATE NONCLUSTERED INDEX [AuthSession_userId_revokedAt_idx] ON [dbo].[AuthSession] ([userId], [revokedAt]);

CREATE NONCLUSTERED INDEX [AuthSession_expiresAt_idx] ON [dbo].[AuthSession] ([expiresAt]);

CREATE NONCLUSTERED INDEX [RefreshToken_sessionId_idx] ON [dbo].[RefreshToken] ([sessionId]);

CREATE NONCLUSTERED INDEX [RefreshToken_expiresAt_idx] ON [dbo].[RefreshToken] ([expiresAt]);

ALTER TABLE [dbo].[AuthCredential] ADD CONSTRAINT [AuthCredential_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[AuthSession] ADD CONSTRAINT [AuthSession_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[RefreshToken] ADD CONSTRAINT [RefreshToken_sessionId_fkey] FOREIGN KEY ([sessionId]) REFERENCES [dbo].[AuthSession] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
