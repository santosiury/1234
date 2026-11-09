-- DBA only, in SSMS with OminiDB selected. Create the SQL login via SSMS first.
-- No passwords, server roles or database creation in this script.
IF DB_NAME() <> N'OminiDB' THROW 50000, 'Select OminiDB before granting permissions.', 1;
IF DATABASE_PRINCIPAL_ID(N'omini_migrator') IS NULL CREATE USER [omini_migrator] FOR LOGIN [omini_migrator];
IF DATABASE_PRINCIPAL_ID(N'omini_migration_role') IS NULL CREATE ROLE [omini_migration_role];
IF IS_ROLEMEMBER(N'omini_migration_role', N'omini_migrator') <> 1 ALTER ROLE [omini_migration_role] ADD MEMBER [omini_migrator];
GRANT CREATE TABLE, VIEW DEFINITION TO [omini_migration_role];
GRANT ALTER, REFERENCES, SELECT, INSERT, UPDATE, DELETE ON SCHEMA::[dbo] TO [omini_migration_role];
-- This role can change objects in dbo in OminiDB. Use only for reviewed migrations,
-- not in the API. Disable the dedicated login when not in use if operationally appropriate.
