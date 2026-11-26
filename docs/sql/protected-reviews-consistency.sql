-- READ ONLY. Post-migration checks, only after separately authorized TEST deployment.
-- No repair, mutation, migration command or connection fallback is performed.
SET NOCOUNT ON;
IF DB_NAME() <> N'OminiDB' THROW 50100, 'Expected OminiDB.', 1;
IF COALESCE(CONVERT(INT, CONNECTIONPROPERTY('local_tcp_port')),0) <> 15433 THROW 50101, 'Only isolated TCP port 15433.', 1;
IF OBJECT_ID(N'dbo.ReviewWindow',N'U') IS NULL OR OBJECT_ID(N'dbo.ParticipantReview',N'U') IS NULL OR OBJECT_ID(N'dbo.ReputationBatch',N'U') IS NULL THROW 50102, 'Protected schema missing.', 1;
IF NOT EXISTS (SELECT 1 FROM dbo._prisma_migrations WHERE migration_name=N'20261124000000_bidirectional_reviews' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THROW 50103, 'Reviewed migration is not recorded as applied.', 1;
IF EXISTS (SELECT 1 FROM dbo._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL) THROW 50104, 'Incomplete migration attempt: stop and review.', 1;
IF NOT EXISTS (SELECT 1 FROM sys.triggers WHERE object_id=OBJECT_ID(N'dbo.ServiceReview_protected_cutover') AND is_disabled=0) THROW 50105, 'Legacy cutover protection is missing.', 1;
DECLARE @legacy BIGINT=(SELECT COUNT_BIG(*) FROM dbo.ServiceReview);
DECLARE @copied BIGINT=(SELECT COUNT_BIG(*) FROM dbo.ParticipantReview WHERE isLegacy=1);
DECLARE @differences BIGINT;
SELECT @differences=COUNT_BIG(*) FROM (
 SELECT id,requestId,clientUserId,providerUserId,rating,CONVERT(VARBINARY(MAX),comment) AS commentBytes,createdAt,createdAt AS publishedAt
 FROM dbo.ServiceReview
 EXCEPT
 SELECT id,requestId,authorUserId,subjectUserId,rating,CONVERT(VARBINARY(MAX),comment),submittedAt,publishedAt
 FROM dbo.ParticipantReview WHERE isLegacy=1 AND direction=N'CLIENT_TO_PROVIDER'
) differences;
SELECT @legacy AS historicalReviews,@copied AS legacyCopies,@differences AS unequalHistoricalRows;
IF @legacy<>@copied OR @differences<>0 THROW 50106, 'Historical copy differs: stop; do not rewrite data.', 1;
IF EXISTS (
 SELECT 1 FROM dbo.ReviewWindow w JOIN dbo.ServiceRequest r ON r.id=w.requestId
 WHERE r.status<>N'COMPLETED' OR r.completedAt IS NULL OR w.completedAt<>r.completedAt OR w.closesAt<>DATEADD(DAY,14,r.completedAt)
 OR NOT EXISTS (SELECT 1 FROM dbo.ServiceRequestEvent e WHERE e.requestId=r.id AND e.actorUserId=r.clientUserId AND e.action=N'confirm-completion' AND e.previousStatus=N'AWAITING_CONFIRMATION' AND e.newStatus=N'COMPLETED' AND e.version=r.version AND e.occurredAt=r.completedAt)
) THROW 50107, 'Review window does not match canonical completion.', 1;
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE parent_object_id IN (OBJECT_ID(N'dbo.ReviewWindow'),OBJECT_ID(N'dbo.ParticipantReview'),OBJECT_ID(N'dbo.ReputationBatch')) AND (is_disabled=1 OR is_not_trusted=1)) THROW 50108, 'Untrusted or disabled review CHECK.', 1;
IF EXISTS (SELECT 1 FROM sys.foreign_keys WHERE parent_object_id IN (OBJECT_ID(N'dbo.ReviewWindow'),OBJECT_ID(N'dbo.ParticipantReview'),OBJECT_ID(N'dbo.ReputationBatch')) AND (is_disabled=1 OR is_not_trusted=1)) THROW 50109, 'Untrusted or disabled review FK.', 1;
SELECT (SELECT COUNT_BIG(*) FROM dbo.ServiceCategory) AS categories,
 (SELECT COUNT_BIG(*) FROM dbo.ServiceRequest) AS requests,
 (SELECT COUNT_BIG(*) FROM dbo.ServiceRequestEvent) AS requestEvents,
 (SELECT COUNT_BIG(*) FROM dbo.ReviewWindow) AS reviewWindows,
 (SELECT COUNT_BIG(*) FROM dbo.ParticipantReview WHERE isLegacy=0) AS newReviews,
 (SELECT COUNT_BIG(*) FROM dbo.ReputationBatch) AS reputationCohorts;
-- First run, before reopening writers: windows/new reviews/cohorts must be zero.
-- Later runs can legitimately contain new records. Compare old-table baseline externally.
SELECT migration_name,checksum,finished_at,rolled_back_at FROM dbo._prisma_migrations ORDER BY started_at;
-- Output contains counts/schema metadata only, never comments, authors or request IDs.
;WITH valid AS (
 SELECT v.id,v.batchId,v.authorUserId FROM dbo.ParticipantReview v
 JOIN dbo.ServiceRequest r ON r.id=v.requestId
 WHERE v.publishedAt IS NOT NULL AND v.rating BETWEEN 1 AND 5 AND v.authorUserId<>v.subjectUserId
 AND ((v.direction=N'CLIENT_TO_PROVIDER' AND v.authorUserId=r.clientUserId AND v.subjectUserId=r.providerUserId)
   OR (v.direction=N'PROVIDER_TO_CLIENT' AND v.authorUserId=r.providerUserId AND v.subjectUserId=r.clientUserId))
 AND r.status=N'COMPLETED' AND r.completedAt IS NOT NULL
 AND EXISTS (SELECT 1 FROM dbo.ServiceRequestEvent e WHERE e.requestId=r.id AND e.actorUserId=r.clientUserId AND e.action=N'confirm-completion' AND e.previousStatus=N'AWAITING_CONFIRMATION' AND e.newStatus=N'COMPLETED' AND e.version=r.version AND e.occurredAt=r.completedAt)
), assessed AS (
 SELECT b.id,b.entryCount,b.distinctAuthorCount,COUNT(m.id) AS actualEntries,COUNT(v.id) AS eligibleEntries,
 COUNT(DISTINCT m.authorUserId) AS actualAuthors,COUNT(DISTINCT v.authorUserId) AS eligibleAuthors
 FROM dbo.ReputationBatch b LEFT JOIN dbo.ParticipantReview m ON m.batchId=b.id
 LEFT JOIN valid v ON v.id=m.id AND v.batchId=b.id
 GROUP BY b.id,b.entryCount,b.distinctAuthorCount
), classified AS (
 SELECT CASE WHEN distinctAuthorCount>=5 AND actualEntries=entryCount AND eligibleEntries=entryCount
 AND actualAuthors=distinctAuthorCount AND eligibleAuthors=distinctAuthorCount THEN 1 ELSE 0 END AS intact
 FROM assessed
)
SELECT COALESCE(SUM(intact),0) AS intactCohorts,COALESCE(SUM(1-intact),0) AS withheldCohorts FROM classified;
-- Withheld cohorts are preserved, not repaired, deleted or re-grouped by this script.
