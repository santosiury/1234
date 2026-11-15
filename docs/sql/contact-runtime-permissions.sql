-- Execute manually as deployment administrator, only after the contact migration.
-- Existing User SELECT/INSERT/UPDATE are retained from authentication grants.
USE [OminiDB];
GO
IF DATABASE_PRINCIPAL_ID(N'omini_runtime_role') IS NULL
    THROW 50001, 'Create the existing runtime role using runtime-permissions.sql first.', 1;
GRANT SELECT ([phone], [hasWhatsapp], [phoneShareConsentedAt]) ON OBJECT::[dbo].[User] TO [omini_runtime_role];
GRANT UPDATE ([phone], [hasWhatsapp], [phoneShareConsentedAt]) ON OBJECT::[dbo].[User] TO [omini_runtime_role];
-- No DELETE, DDL, server privilege or broad database role is added.
GO
