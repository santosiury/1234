-- Phase 2.4: additive request/history structures. Review before deployment.
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;
IF DB_NAME() <> N'OminiDB' THROW 50000, 'Expected OminiDB.', 1;
IF OBJECT_ID(N'[dbo].[User]', N'U') IS NULL THROW 50001, 'Apply existing phases first.', 1;
IF OBJECT_ID(N'[dbo].[ClientProfile]', N'U') IS NULL THROW 50001, 'Apply existing phases first.', 1;
IF OBJECT_ID(N'[dbo].[ProviderProfile]', N'U') IS NULL THROW 50001, 'Apply existing phases first.', 1;
IF OBJECT_ID(N'[dbo].[ProviderService]', N'U') IS NULL THROW 50001, 'Apply existing phases first.', 1;
IF OBJECT_ID(N'[dbo].[ProviderServiceArea]', N'U') IS NULL THROW 50001, 'Apply existing phases first.', 1;
IF OBJECT_ID(N'[dbo].[ServiceRequest]', N'U') IS NOT NULL THROW 50002, 'Request objects exist; review migration history.', 1;
IF OBJECT_ID(N'[dbo].[ServiceRequestEvent]', N'U') IS NOT NULL THROW 50002, 'Request objects exist; review migration history.', 1;

CREATE TABLE [dbo].[ServiceRequest] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ServiceRequest_id_df] DEFAULT (newid()),
    [clientUserId] UNIQUEIDENTIFIER NOT NULL,
    [providerUserId] UNIQUEIDENTIFIER NOT NULL,
    [providerId] UNIQUEIDENTIFIER NOT NULL,
    [providerServiceId] UNIQUEIDENTIFIER NOT NULL,
    [clientNameSnapshot] NVARCHAR(120) NOT NULL,
    [providerNameSnapshot] NVARCHAR(120) NOT NULL,
    [serviceTitleSnapshot] NVARCHAR(120) NOT NULL,
    [status] NVARCHAR(32) NOT NULL CONSTRAINT [ServiceRequest_status_df] DEFAULT (N'REQUESTED'),
    [description] NVARCHAR(1000) NOT NULL,
    [city] NVARCHAR(100) NOT NULL,
    [state] CHAR(2) NOT NULL,
    [neighborhood] NVARCHAR(100) NOT NULL CONSTRAINT [ServiceRequest_neighborhood_df] DEFAULT (N''),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ServiceRequest_createdAt_df] DEFAULT (sysutcdatetime()),
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [ServiceRequest_updatedAt_df] DEFAULT (sysutcdatetime()),
    [acceptedAt] DATETIME2 NULL,
    [startedAt] DATETIME2 NULL,
    [completionProposedAt] DATETIME2 NULL,
    [completedAt] DATETIME2 NULL,
    [cancelledAt] DATETIME2 NULL,
    [version] INT NOT NULL CONSTRAINT [ServiceRequest_version_df] DEFAULT (1),
    [idempotencyKey] UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT [ServiceRequest_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ServiceRequest_clientUserId_idempotencyKey_key] UNIQUE NONCLUSTERED ([clientUserId], [idempotencyKey])
);

CREATE TABLE [dbo].[ServiceRequestEvent] (
    [id] UNIQUEIDENTIFIER NOT NULL CONSTRAINT [ServiceRequestEvent_id_df] DEFAULT (newid()),
    [requestId] UNIQUEIDENTIFIER NOT NULL,
    [actorUserId] UNIQUEIDENTIFIER NOT NULL,
    [previousStatus] NVARCHAR(32) NULL,
    [newStatus] NVARCHAR(32) NOT NULL,
    [action] NVARCHAR(32) NOT NULL,
    [occurredAt] DATETIME2 NOT NULL CONSTRAINT [ServiceRequestEvent_occurredAt_df] DEFAULT (sysutcdatetime()),
    [reason] NVARCHAR(500) NULL,
    [version] INT NOT NULL,
    [idempotencyKey] UNIQUEIDENTIFIER NOT NULL,
    [payloadHash] CHAR(64) NOT NULL,
    CONSTRAINT [ServiceRequestEvent_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ServiceRequestEvent_actorUserId_idempotencyKey_key] UNIQUE NONCLUSTERED ([actorUserId], [idempotencyKey]),
    CONSTRAINT [ServiceRequestEvent_requestId_version_key] UNIQUE NONCLUSTERED ([requestId], [version])
);

CREATE NONCLUSTERED INDEX [ServiceRequest_clientUserId_status_createdAt_id_idx] ON [dbo].[ServiceRequest] ([clientUserId], [status], [createdAt], [id]);

CREATE NONCLUSTERED INDEX [ServiceRequest_providerUserId_status_createdAt_id_idx] ON [dbo].[ServiceRequest] ([providerUserId], [status], [createdAt], [id]);

ALTER TABLE [dbo].[ServiceRequest] ADD CONSTRAINT [ServiceRequest_clientUserId_fkey] FOREIGN KEY ([clientUserId]) REFERENCES [dbo].[User] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[ServiceRequest] ADD CONSTRAINT [ServiceRequest_providerUserId_fkey] FOREIGN KEY ([providerUserId]) REFERENCES [dbo].[User] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[ServiceRequest] ADD CONSTRAINT [ServiceRequest_providerId_fkey] FOREIGN KEY ([providerId]) REFERENCES [dbo].[ProviderProfile] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[ServiceRequest] ADD CONSTRAINT [ServiceRequest_providerServiceId_fkey] FOREIGN KEY ([providerServiceId]) REFERENCES [dbo].[ProviderService] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[ServiceRequestEvent] ADD CONSTRAINT [ServiceRequestEvent_requestId_fkey] FOREIGN KEY ([requestId]) REFERENCES [dbo].[ServiceRequest] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[ServiceRequestEvent] ADD CONSTRAINT [ServiceRequestEvent_actorUserId_fkey] FOREIGN KEY ([actorUserId]) REFERENCES [dbo].[User] ([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

ALTER TABLE [dbo].[ServiceRequest] ADD CONSTRAINT [ServiceRequest_status_check] CHECK ([status] IN (N'REQUESTED',N'ACCEPTED',N'REJECTED',N'IN_PROGRESS',N'AWAITING_CONFIRMATION',N'COMPLETED',N'CANCELLED'));
ALTER TABLE [dbo].[ServiceRequest] ADD CONSTRAINT [ServiceRequest_participants_check] CHECK ([clientUserId] <> [providerUserId]);
ALTER TABLE [dbo].[ServiceRequest] ADD CONSTRAINT [ServiceRequest_version_check] CHECK ([version] >= 1);
ALTER TABLE [dbo].[ServiceRequest] ADD CONSTRAINT [ServiceRequest_completion_check] CHECK (([status] = N'COMPLETED' AND [completedAt] IS NOT NULL) OR ([status] <> N'COMPLETED' AND [completedAt] IS NULL));
ALTER TABLE [dbo].[ServiceRequest] ADD CONSTRAINT [ServiceRequest_cancellation_check] CHECK (([status] = N'CANCELLED' AND [cancelledAt] IS NOT NULL) OR ([status] <> N'CANCELLED' AND [cancelledAt] IS NULL));
ALTER TABLE [dbo].[ServiceRequest] ADD CONSTRAINT [ServiceRequest_progress_check] CHECK ([status] NOT IN (N'ACCEPTED',N'IN_PROGRESS',N'AWAITING_CONFIRMATION',N'COMPLETED') OR [acceptedAt] IS NOT NULL);
ALTER TABLE [dbo].[ServiceRequest] ADD CONSTRAINT [ServiceRequest_start_check] CHECK ([status] NOT IN (N'IN_PROGRESS',N'AWAITING_CONFIRMATION',N'COMPLETED') OR [startedAt] IS NOT NULL);
ALTER TABLE [dbo].[ServiceRequest] ADD CONSTRAINT [ServiceRequest_proposal_check] CHECK ([status] NOT IN (N'AWAITING_CONFIRMATION',N'COMPLETED') OR [completionProposedAt] IS NOT NULL);
ALTER TABLE [dbo].[ServiceRequestEvent] ADD CONSTRAINT [ServiceRequestEvent_transition_check] CHECK (
 ([previousStatus] IS NULL AND [newStatus]=N'REQUESTED' AND [action]=N'create' AND [version]=1) OR
 ([previousStatus] IS NOT NULL AND (
 ([previousStatus]=N'REQUESTED' AND [newStatus]=N'ACCEPTED' AND [action]=N'accept' AND [version]>1) OR
 ([previousStatus]=N'REQUESTED' AND [newStatus]=N'REJECTED' AND [action]=N'reject' AND [version]>1) OR
 ([previousStatus] IN (N'REQUESTED',N'ACCEPTED') AND [newStatus]=N'CANCELLED' AND [action]=N'cancel' AND [version]>1) OR
 ([previousStatus]=N'ACCEPTED' AND [newStatus]=N'IN_PROGRESS' AND [action]=N'start' AND [version]>1) OR
 ([previousStatus]=N'IN_PROGRESS' AND [newStatus]=N'AWAITING_CONFIRMATION' AND [action]=N'propose-completion' AND [version]>1) OR
 ([previousStatus]=N'AWAITING_CONFIRMATION' AND [newStatus]=N'COMPLETED' AND [action]=N'confirm-completion' AND [version]>1) OR
 ([previousStatus]=N'AWAITING_CONFIRMATION' AND [newStatus]=N'IN_PROGRESS' AND [action]=N'reopen' AND [version]>1 AND [reason] IS NOT NULL AND LEN(LTRIM(RTRIM([reason])))>=10)
 ))
);
ALTER TABLE [dbo].[ServiceRequest] ADD CONSTRAINT [ServiceRequest_time_check] CHECK ([updatedAt] >= [createdAt] AND ([acceptedAt] IS NULL OR [acceptedAt] >= [createdAt]) AND ([startedAt] IS NULL OR [startedAt] >= [acceptedAt]) AND ([completedAt] IS NULL OR [completedAt] >= [completionProposedAt]));
COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
