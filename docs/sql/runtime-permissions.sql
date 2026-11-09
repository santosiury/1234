-- DBA only, AFTER applying the reviewed migration, in OminiDB.
IF DB_NAME() <> N'OminiDB' THROW 50000, 'Select OminiDB before granting permissions.', 1;
IF DATABASE_PRINCIPAL_ID(N'omini_app') IS NULL CREATE USER [omini_app] FOR LOGIN [omini_app];
IF DATABASE_PRINCIPAL_ID(N'omini_runtime_role') IS NULL CREATE ROLE [omini_runtime_role];
IF IS_ROLEMEMBER(N'omini_runtime_role', N'omini_app') <> 1 ALTER ROLE [omini_runtime_role] ADD MEMBER [omini_app];
GRANT SELECT, INSERT, UPDATE ON OBJECT::[dbo].[User] TO [omini_runtime_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::[dbo].[ClientProfile] TO [omini_runtime_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::[dbo].[ProviderProfile] TO [omini_runtime_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::[dbo].[ServiceCategory] TO [omini_runtime_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::[dbo].[ProviderService] TO [omini_runtime_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::[dbo].[ProviderServiceArea] TO [omini_runtime_role];
-- No DELETE, DDL or _prisma_migrations access. Activation uses isActive.
-- GRANTs do not remove pre-existing privileges; inspect the login/user memberships.
