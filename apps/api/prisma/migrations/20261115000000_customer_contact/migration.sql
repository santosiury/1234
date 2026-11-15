-- Additive: existing phone values, categories, requests and history remain untouched.
SET XACT_ABORT ON;
BEGIN TRY
BEGIN TRAN;
IF DB_NAME() <> N'OminiDB' THROW 50000, 'Expected OminiDB.', 1;
IF OBJECT_ID(N'[dbo].[User]', N'U') IS NULL THROW 50001, 'Apply existing phases first.', 1;
ALTER TABLE [dbo].[User] ADD [hasWhatsapp] BIT NOT NULL CONSTRAINT [User_hasWhatsapp_df] DEFAULT 0,
    [phoneShareConsentedAt] DATETIME2 NULL;
COMMIT TRAN;
END TRY
BEGIN CATCH
IF @@TRANCOUNT > 0 ROLLBACK TRAN;
THROW;
END CATCH;
