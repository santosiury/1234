-- Initial additive migration. Never applies automatically at API startup.
-- Refuse collisions: inspect and baseline existing objects manually if necessary.
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;
IF DB_NAME() <> N'OminiDB' THROW 50000, 'Expected database OminiDB.', 1;
IF OBJECT_ID(N'[dbo].[User]', N'U') IS NOT NULL THROW 50001, 'Target objects already exist; review migration history.', 1;
IF OBJECT_ID(N'[dbo].[ClientProfile]', N'U') IS NOT NULL THROW 50001, 'Target objects already exist; review migration history.', 1;
IF OBJECT_ID(N'[dbo].[ProviderProfile]', N'U') IS NOT NULL THROW 50001, 'Target objects already exist; review migration history.', 1;
IF OBJECT_ID(N'[dbo].[ServiceCategory]', N'U') IS NOT NULL THROW 50001, 'Target objects already exist; review migration history.', 1;
IF OBJECT_ID(N'[dbo].[ProviderService]', N'U') IS NOT NULL THROW 50001, 'Target objects already exist; review migration history.', 1;
IF OBJECT_ID(N'[dbo].[ProviderServiceArea]', N'U') IS NOT NULL THROW 50001, 'Target objects already exist; review migration history.', 1;

CREATE TABLE [dbo].[User] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [User_id_df] DEFAULT (newid()),
    [email] NVARCHAR(254) NOT NULL,
    [displayName] NVARCHAR(120) NOT NULL,
    [phone] NVARCHAR(25) NULL,
    [isActive] BIT NOT NULL CONSTRAINT [User_isActive_df] DEFAULT (1),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [User_createdAt_df] DEFAULT (sysutcdatetime()),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [User_updatedAt_df] DEFAULT (sysutcdatetime()),
    CONSTRAINT [User_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [User_email_key] UNIQUE NONCLUSTERED ([email])
);

CREATE TABLE [dbo].[ClientProfile] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ClientProfile_id_df] DEFAULT (newid()),
    [userId] UNIQUEIDENTIFIER NOT NULL,
    [city] NVARCHAR(100) NOT NULL CONSTRAINT [ClientProfile_city_df] DEFAULT (N'Araranguá'),
    [state] CHAR(2) NOT NULL CONSTRAINT [ClientProfile_state_df] DEFAULT (N'SC'),
    [isActive] BIT NOT NULL CONSTRAINT [ClientProfile_isActive_df] DEFAULT (1),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ClientProfile_createdAt_df] DEFAULT (sysutcdatetime()),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [ClientProfile_updatedAt_df] DEFAULT (sysutcdatetime()),
    CONSTRAINT [ClientProfile_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ClientProfile_userId_key] UNIQUE NONCLUSTERED ([userId])
);

CREATE TABLE [dbo].[ProviderProfile] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ProviderProfile_id_df] DEFAULT (newid()),
    [userId] UNIQUEIDENTIFIER NOT NULL,
    [professionalName] NVARCHAR(120) NOT NULL,
    [bio] NVARCHAR(1000) NULL,
    [isActive] BIT NOT NULL CONSTRAINT [ProviderProfile_isActive_df] DEFAULT (1),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ProviderProfile_createdAt_df] DEFAULT (sysutcdatetime()),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [ProviderProfile_updatedAt_df] DEFAULT (sysutcdatetime()),
    CONSTRAINT [ProviderProfile_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ProviderProfile_userId_key] UNIQUE NONCLUSTERED ([userId])
);

CREATE TABLE [dbo].[ServiceCategory] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ServiceCategory_id_df] DEFAULT (newid()),
    [slug] NVARCHAR(80) NOT NULL,
    [name] NVARCHAR(80) NOT NULL,
    [sortOrder] INT NOT NULL CONSTRAINT [ServiceCategory_sortOrder_df] DEFAULT (0),
    [isActive] BIT NOT NULL CONSTRAINT [ServiceCategory_isActive_df] DEFAULT (1),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ServiceCategory_createdAt_df] DEFAULT (sysutcdatetime()),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [ServiceCategory_updatedAt_df] DEFAULT (sysutcdatetime()),
    CONSTRAINT [ServiceCategory_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ServiceCategory_slug_key] UNIQUE NONCLUSTERED ([slug])
);

CREATE TABLE [dbo].[ProviderService] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ProviderService_id_df] DEFAULT (newid()),
    [providerId] UNIQUEIDENTIFIER NOT NULL,
    [categoryId] UNIQUEIDENTIFIER NOT NULL,
    [title] NVARCHAR(120) NOT NULL,
    [description] NVARCHAR(1000) NULL,
    [isActive] BIT NOT NULL CONSTRAINT [ProviderService_isActive_df] DEFAULT (1),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ProviderService_createdAt_df] DEFAULT (sysutcdatetime()),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [ProviderService_updatedAt_df] DEFAULT (sysutcdatetime()),
    CONSTRAINT [ProviderService_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ProviderService_providerId_categoryId_title_key] UNIQUE NONCLUSTERED ([providerId], [categoryId], [title])
);

CREATE TABLE [dbo].[ProviderServiceArea] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ProviderServiceArea_id_df] DEFAULT (newid()),
    [providerId] UNIQUEIDENTIFIER NOT NULL,
    [city] NVARCHAR(100) NOT NULL,
    [state] CHAR(2) NOT NULL,
    [neighborhood] NVARCHAR(100) NOT NULL CONSTRAINT [ProviderServiceArea_neighborhood_df] DEFAULT (N''),
    [isActive] BIT NOT NULL CONSTRAINT [ProviderServiceArea_isActive_df] DEFAULT (1),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ProviderServiceArea_createdAt_df] DEFAULT (sysutcdatetime()),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [ProviderServiceArea_updatedAt_df] DEFAULT (sysutcdatetime()),
    CONSTRAINT [ProviderServiceArea_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ProviderServiceArea_providerId_state_city_neighborhood_key] UNIQUE NONCLUSTERED ([providerId], [state], [city], [neighborhood])
);

CREATE NONCLUSTERED INDEX [User_isActive_createdAt_idx] ON [dbo].[User] ([isActive], [createdAt]);

CREATE NONCLUSTERED INDEX [ProviderProfile_isActive_createdAt_idx] ON [dbo].[ProviderProfile] ([isActive], [createdAt]);

CREATE NONCLUSTERED INDEX [ServiceCategory_isActive_sortOrder_idx] ON [dbo].[ServiceCategory] ([isActive], [sortOrder]);

CREATE NONCLUSTERED INDEX [ProviderService_categoryId_isActive_providerId_idx] ON [dbo].[ProviderService] ([categoryId], [isActive], [providerId]);

CREATE NONCLUSTERED INDEX [ProviderServiceArea_state_city_isActive_providerId_idx] ON [dbo].[ProviderServiceArea] ([state], [city], [isActive], [providerId]);

ALTER TABLE [dbo].[ClientProfile] ADD CONSTRAINT [ClientProfile_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[ProviderProfile] ADD CONSTRAINT [ProviderProfile_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[ProviderService] ADD CONSTRAINT [ProviderService_providerId_fkey] FOREIGN KEY ([providerId]) REFERENCES [dbo].[ProviderProfile] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[ProviderService] ADD CONSTRAINT [ProviderService_categoryId_fkey] FOREIGN KEY ([categoryId]) REFERENCES [dbo].[ServiceCategory] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[ProviderServiceArea] ADD CONSTRAINT [ProviderServiceArea_providerId_fkey] FOREIGN KEY ([providerId]) REFERENCES [dbo].[ProviderProfile] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
