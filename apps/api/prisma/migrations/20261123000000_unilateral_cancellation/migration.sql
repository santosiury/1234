-- Phase 2.6: prepare only. Do not execute without separate environment approval.
-- Adds nullable audit metadata; never rewrites historical rows or generates evaluations.
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRANSACTION;
IF DB_NAME() <> N'OminiDB' THROW 50000, 'Expected OminiDB.', 1;
IF OBJECT_ID(N'[dbo].[ServiceRequestEvent]', N'U') IS NULL THROW 50001, 'Apply previous phases first.', 1;
IF OBJECT_ID(N'[dbo].[ServiceRequestEvent_transition_check]', N'C') IS NULL THROW 50002, 'Expected transition constraint is missing.', 1;
IF COL_LENGTH(N'dbo.ServiceRequestEvent', N'reasonCode') IS NOT NULL OR COL_LENGTH(N'dbo.ServiceRequestEvent', N'executionContext') IS NOT NULL THROW 50003, 'Cancellation columns exist; review migration history.', 1;
ALTER TABLE [dbo].[ServiceRequestEvent] ADD [reasonCode] NVARCHAR(40) NULL, [executionContext] NVARCHAR(32) NULL;
-- Transactional schema locks cover DROP + WITH CHECK ADD, with validation of existing rows.
ALTER TABLE [dbo].[ServiceRequestEvent] DROP CONSTRAINT [ServiceRequestEvent_transition_check];
ALTER TABLE [dbo].[ServiceRequestEvent] WITH CHECK ADD CONSTRAINT [ServiceRequestEvent_transition_check] CHECK (
 ([previousStatus] IS NULL AND [newStatus]=N'REQUESTED' AND [action]=N'create' AND [version]=1) OR
 ([previousStatus] IS NOT NULL AND (
 ([previousStatus]=N'REQUESTED' AND [newStatus]=N'ACCEPTED' AND [action]=N'accept' AND [version]>1) OR
 ([previousStatus]=N'REQUESTED' AND [newStatus]=N'REJECTED' AND [action]=N'reject' AND [version]>1) OR
 ([previousStatus] IN (N'REQUESTED',N'ACCEPTED',N'IN_PROGRESS',N'AWAITING_CONFIRMATION') AND [newStatus]=N'CANCELLED' AND [action]=N'cancel' AND [version]>1) OR
 ([previousStatus]=N'ACCEPTED' AND [newStatus]=N'IN_PROGRESS' AND [action]=N'start' AND [version]>1) OR
 ([previousStatus]=N'IN_PROGRESS' AND [newStatus]=N'AWAITING_CONFIRMATION' AND [action]=N'propose-completion' AND [version]>1) OR
 ([previousStatus]=N'AWAITING_CONFIRMATION' AND [newStatus]=N'COMPLETED' AND [action]=N'confirm-completion' AND [version]>1) OR
 ([previousStatus]=N'AWAITING_CONFIRMATION' AND [newStatus]=N'IN_PROGRESS' AND [action]=N'reopen' AND [version]>1 AND [reason] IS NOT NULL AND LEN(LTRIM(RTRIM([reason])))>=10)
 ))
);
ALTER TABLE [dbo].[ServiceRequestEvent] CHECK CONSTRAINT [ServiceRequestEvent_transition_check];
-- NULL metadata preserves historical events. Newly admitted started cancellations require context.
-- Compile references to the new columns only after ALTER TABLE ADD executes.
-- The nested batch shares this transaction; errors reach the outer CATCH.
EXEC sys.sp_executesql N'
ALTER TABLE [dbo].[ServiceRequestEvent] WITH CHECK ADD CONSTRAINT [ServiceRequestEvent_cancellation_metadata_check] CHECK (
  ([reasonCode] IS NULL AND [executionContext] IS NULL AND NOT (
    [previousStatus] IS NOT NULL AND [previousStatus] IN (N''IN_PROGRESS'',N''AWAITING_CONFIRMATION'') AND [newStatus]=N''CANCELLED''
  )) OR
  ([reasonCode] IS NOT NULL AND [action]=N''cancel'' AND [newStatus]=N''CANCELLED''
    AND [previousStatus] IS NOT NULL AND [previousStatus] IN (N''REQUESTED'',N''ACCEPTED'',N''IN_PROGRESS'',N''AWAITING_CONFIRMATION'')
    AND [reasonCode] IN (N''PRICE_DISAGREEMENT'',N''SCHEDULE_DISAGREEMENT'',N''SCOPE_DISAGREEMENT'',N''SERVICE_NO_LONGER_NEEDED'',N''UNABLE_TO_ATTEND'',N''OTHER'')
    AND [reason] IS NOT NULL AND (([reasonCode]=N''OTHER'' AND LEN(LTRIM(RTRIM([reason]))) BETWEEN 10 AND 500) OR ([reasonCode]<>N''OTHER'' AND LEN(LTRIM(RTRIM([reason]))) BETWEEN 1 AND 500))
    AND (([executionContext] IS NULL AND [previousStatus] NOT IN (N''IN_PROGRESS'',N''AWAITING_CONFIRMATION'')) OR
         ([executionContext] IS NOT NULL AND [executionContext] IN (N''NONE'',N''PARTIAL'',N''FULL_CLAIMED'',N''DISPUTED'')))
  )
);
';
COMMIT TRANSACTION;
END TRY
BEGIN CATCH
IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
THROW;
END CATCH;
