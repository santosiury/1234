-- READ ONLY. Run as omini_app, only after the separately authorized TEST migration/GRANTs.
SET NOCOUNT ON;
IF DB_NAME() <> N'OminiDB' THROW 50200, 'Expected OminiDB.', 1;
IF COALESCE(CONVERT(INT, CONNECTIONPROPERTY('local_tcp_port')),0) <> 15433 THROW 50201, 'Only isolated TCP port 15433.', 1;
IF ORIGINAL_LOGIN() <> N'omini_app' THROW 50202, 'Use the restricted runtime identity.', 1;
IF IS_ROLEMEMBER(N'db_owner')=1 OR IS_ROLEMEMBER(N'db_datawriter')=1 THROW 50203, 'Runtime has a prohibited broad role.', 1;
DECLARE @bad INT;
;WITH expected AS (
 SELECT * FROM (VALUES
 (N'dbo.ReviewWindow',N'SELECT',CAST(NULL AS NVARCHAR(128)),1),
 (N'dbo.ReviewWindow',N'INSERT',NULL,1),
 (N'dbo.ReviewWindow',N'UPDATE',N'releasedAt',1),
 (N'dbo.ReviewWindow',N'UPDATE',N'requestId',0),
 (N'dbo.ReviewWindow',N'UPDATE',N'completedAt',0),
 (N'dbo.ReviewWindow',N'UPDATE',N'closesAt',0),
 (N'dbo.ReviewWindow',N'DELETE',NULL,0),
 (N'dbo.ParticipantReview',N'SELECT',NULL,1),
 (N'dbo.ParticipantReview',N'INSERT',NULL,1),
 (N'dbo.ParticipantReview',N'UPDATE',N'publishedAt',1),
 (N'dbo.ParticipantReview',N'UPDATE',N'batchId',1),
 (N'dbo.ParticipantReview',N'UPDATE',N'id',0),
 (N'dbo.ParticipantReview',N'UPDATE',N'rating',0),
 (N'dbo.ParticipantReview',N'UPDATE',N'comment',0),
 (N'dbo.ParticipantReview',N'UPDATE',N'authorUserId',0),
 (N'dbo.ParticipantReview',N'UPDATE',N'subjectUserId',0),
 (N'dbo.ParticipantReview',N'UPDATE',N'requestId',0),
 (N'dbo.ParticipantReview',N'UPDATE',N'direction',0),
 (N'dbo.ParticipantReview',N'UPDATE',N'submittedAt',0),
 (N'dbo.ParticipantReview',N'UPDATE',N'isLegacy',0),
 (N'dbo.ParticipantReview',N'DELETE',NULL,0),
 (N'dbo.ReputationBatch',N'SELECT',NULL,1),
 (N'dbo.ReputationBatch',N'INSERT',NULL,1),
 (N'dbo.ReputationBatch',N'UPDATE',NULL,0),
 (N'dbo.ReputationBatch',N'UPDATE',N'id',0),
 (N'dbo.ReputationBatch',N'UPDATE',N'subjectUserId',0),
 (N'dbo.ReputationBatch',N'UPDATE',N'direction',0),
 (N'dbo.ReputationBatch',N'UPDATE',N'entryCount',0),
 (N'dbo.ReputationBatch',N'UPDATE',N'distinctAuthorCount',0),
 (N'dbo.ReputationBatch',N'UPDATE',N'createdAt',0),
 (N'dbo.ReputationBatch',N'DELETE',NULL,0)
 ) e(objectName,permissionName,columnName,allowed)
)
SELECT @bad=COUNT(*) FROM expected
WHERE COALESCE(CASE WHEN columnName IS NULL THEN HAS_PERMS_BY_NAME(objectName,N'OBJECT',permissionName)
 ELSE HAS_PERMS_BY_NAME(objectName,N'OBJECT',permissionName,columnName,N'COLUMN') END,-1)<>allowed;
SELECT @bad AS permissionMismatches;
IF @bad<>0 THROW 50204, 'Runtime permissions differ from the reviewed least-privilege policy.', 1;
-- Does not GRANT or REVOKE anything. Review inherited roles/ownership with the DBA on failure.
