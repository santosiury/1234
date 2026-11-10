-- DBA only after the incremental auth migration.
IF DB_NAME() <> N'OminiDB' THROW 50000, 'Select OminiDB.', 1;

-- Authentication tables: rotation/revocation uses UPDATE, not DELETE.
GRANT SELECT, INSERT, UPDATE ON OBJECT::[dbo].[AuthCredential] TO [omini_runtime_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::[dbo].[AuthSession] TO [omini_runtime_role];
GRANT SELECT, INSERT, UPDATE ON OBJECT::[dbo].[RefreshToken] TO [omini_runtime_role];
