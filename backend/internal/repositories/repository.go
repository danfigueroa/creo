package repositories

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"strconv"
	"strings"
	"time"

	"parish-viva/backend/internal/models"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrDuplicatePrayedAction = errors.New("duplicate prayed action")
var ErrInviteOnlyGroup = errors.New("invite only group")
var ErrGroupAdminRequired = errors.New("group admin required")
var ErrJoinRequestNotFound = errors.New("join request not found")
var ErrFriendUserNotFound = errors.New("friend user not found")
var ErrCannotAddSelf = errors.New("cannot add self")
var ErrFriendRequestAlreadyExists = errors.New("friend request already exists")
var ErrFriendRequestNotFound = errors.New("friend request not found")
var ErrFriendshipNotFound = errors.New("friendship not found")
var ErrUsernameTaken = errors.New("username already in use")
var ErrAccountDeleted = errors.New("account deleted")
var ErrGroupAccessDenied = errors.New("group access denied")
var ErrPrayerRequestNotFound = errors.New("prayer request not found")
var ErrPrayerRequestForbidden = errors.New("prayer request forbidden")
var ErrGroupNotFound = errors.New("group not found")
var ErrGroupMembershipNotFound = errors.New("group membership not found")
var ErrUserNotFound = errors.New("user not found")
var ErrAlreadyBlocked = errors.New("already blocked")
var ErrBlockNotFound = errors.New("block not found")
var ErrUserBlocked = errors.New("user blocked")
var ErrModerationNotApplicable = errors.New("moderation not applicable")
var ErrAnnouncementNotFound = errors.New("announcement not found")
var ErrVerseNotFound = errors.New("verse not found")
var ErrVerseShareNotFound = errors.New("verse share not found")

type Repository interface {
	GetUserByID(ctx context.Context, userID string) (models.User, error)
	GetUserByUsername(ctx context.Context, username string) (models.User, error)
	UpdateUserProfile(ctx context.Context, userID, displayName, username string, avatarURL *string, setAvatar bool, bio *string, setBio bool) (models.User, error)
	GetFriendshipState(ctx context.Context, viewerID, ownerID string) (models.PublicFriendshipState, *string, *string, error)
	GetUserStats(ctx context.Context, userID string) (models.ProfileStats, error)
	UpsertAuthUser(ctx context.Context, userID, email, preferredUsername, preferredDisplayName, preferredTradition string) error
	SetUserTradition(ctx context.Context, userID string, tradition models.Tradition) (models.User, error)
	SetUserLanguage(ctx context.Context, userID string, language models.Language) (models.User, error)
	UsernameExists(ctx context.Context, username string) (bool, error)
	CreatePrayerRequest(ctx context.Context, in models.CreatePrayerRequestInput) (models.PrayerRequest, error)
	UpdatePrayerRequest(ctx context.Context, in models.UpdatePrayerRequestInput) (models.PrayerRequest, error)
	DeletePrayerRequest(ctx context.Context, userID, requestID string) error
	MarkPrayerRequestAnswered(ctx context.Context, in models.AnswerPrayerRequestInput) (models.PrayerRequest, error)
	ClearPrayerRequestAnswered(ctx context.Context, userID, requestID string) (models.PrayerRequest, error)
	GetPrayerRequestByID(ctx context.Context, userID, requestID string) (models.PrayerRequest, error)
	GetPrayerRequestAccess(ctx context.Context, viewerUserID, requestID string) (models.PrayerRequestAccess, error)
	ListPublicPrayerRequests(ctx context.Context, viewerUserID string, limit, offset int) ([]models.PrayerRequest, error)
	CountPublicPrayerRequests(ctx context.Context, viewerUserID string) (int64, error)
	ListGroupsPrayerRequests(ctx context.Context, userID string, limit, offset int) ([]models.PrayerRequest, error)
	CountGroupsPrayerRequests(ctx context.Context, userID string) (int64, error)
	ListFriendsPrayerRequests(ctx context.Context, userID string, limit, offset int) ([]models.PrayerRequest, error)
	CountFriendsPrayerRequests(ctx context.Context, userID string) (int64, error)
	ListHomePrayerRequests(ctx context.Context, userID string, limit, offset int) ([]models.PrayerRequest, error)
	CountHomePrayerRequests(ctx context.Context, userID string) (int64, error)
	EnrichPrayerRequests(ctx context.Context, viewerUserID string, items []*models.PrayerRequest) error
	RecordPrayerAction(ctx context.Context, in models.ReactionInput) error
	ListPrayerActionsByRequest(ctx context.Context, viewerUserID, requestID string) ([]models.PrayerActionRecord, error)
	ListMyPrayers(ctx context.Context, userID string, limit, offset int) ([]models.MyPrayerEntry, error)
	CreatePrayerRequestUpdate(ctx context.Context, requestID, authorID, body string) (models.PrayerRequestUpdate, error)
	ListPrayerRequestUpdates(ctx context.Context, viewerUserID, requestID string) ([]models.PrayerRequestUpdate, models.PrayerRequestAccess, error)
	ListUserGroups(ctx context.Context, userID string) ([]models.Group, error)
	SearchGroupsByName(ctx context.Context, userID, query string, limit int) ([]models.GroupSummary, error)
	CreateGroup(ctx context.Context, userID, name, description string, imageURL *string, joinPolicy models.GroupJoinPolicy) (models.Group, error)
	RequestJoinGroup(ctx context.Context, userID, groupID string) error
	ListGroupJoinRequests(ctx context.Context, actorUserID, groupID string) ([]models.GroupJoinRequest, error)
	ApproveGroupJoinRequest(ctx context.Context, actorUserID, groupID, requestID string) error
	RejectGroupJoinRequest(ctx context.Context, actorUserID, groupID, requestID string) error
	GetGroupDetails(ctx context.Context, viewerUserID, groupID string) (models.GroupDetails, error)
	ListGroupMembers(ctx context.Context, groupID string, limit, offset int) ([]models.GroupMember, int64, error)
	GetGroupRoleOf(ctx context.Context, userID, groupID string) (models.GroupRole, bool, error)
	CountGroupAdmins(ctx context.Context, groupID string) (int64, error)
	ChangeMemberRole(ctx context.Context, groupID, targetUserID string, newRole models.GroupRole) error
	RemoveMember(ctx context.Context, groupID, targetUserID string) error
	UpdateGroup(ctx context.Context, groupID string, in models.UpdateGroupInput) (models.Group, error)
	ListPrayerRequestsByGroup(ctx context.Context, viewerUserID, groupID string, limit, offset int) ([]models.PrayerRequest, error)
	CountPrayerRequestsByGroup(ctx context.Context, viewerUserID, groupID string) (int64, error)
	SendFriendRequest(ctx context.Context, fromUserID, targetUsername string) error
	ListFriends(ctx context.Context, userID string) ([]models.Friend, error)
	ListPendingFriendRequests(ctx context.Context, userID string) ([]models.FriendRequest, error)
	AcceptFriendRequest(ctx context.Context, userID, requestID string) error
	RejectFriendRequest(ctx context.Context, userID, requestID string) error
	CancelFriendRequest(ctx context.Context, userID, requestID string) error
	RemoveFriendship(ctx context.Context, userID, targetUserID string) error
	SearchUsersForFriendship(ctx context.Context, userID, query string, limit int) ([]models.UserSummary, error)
	SuggestFriends(ctx context.Context, userID string, limit int) ([]models.UserSuggestion, error)
	BlockUser(ctx context.Context, blockerID, blockedUsername string) (models.BlockedUser, error)
	UnblockUser(ctx context.Context, blockerID, blockedUserID string) error
	ListBlockedUsers(ctx context.Context, blockerID string) ([]models.BlockedUser, error)
	IsBlockedEitherWay(ctx context.Context, viewerID, otherID string) (bool, error)
	BlockDirection(ctx context.Context, viewerID, otherID string) (string, error)
	ListModerationQueue(ctx context.Context, moderatorUserID string, limit, offset int) ([]models.ModerationQueueItem, error)
	ApplyModerationAction(ctx context.Context, moderatorUserID, requestID string, action models.ModerationActionType, reason string) error
	ListModerationHistory(ctx context.Context, viewerUserID, requestID string) ([]models.ModerationActionRecord, error)
	CreateNotification(ctx context.Context, in models.CreateNotificationInput) error
	ListNotifications(ctx context.Context, userID string, limit, offset int) ([]models.NotificationView, models.NotificationSummary, error)
	GetNotificationSummary(ctx context.Context, userID string) (models.NotificationSummary, error)
	MarkNotificationRead(ctx context.Context, userID, id string) error
	MarkAllNotificationsRead(ctx context.Context, userID string) error
	CreateAnnouncement(ctx context.Context, in models.CreateAnnouncementInput) (models.GroupAnnouncement, error)
	GetAnnouncementByID(ctx context.Context, announcementID string) (models.GroupAnnouncement, error)
	ListAnnouncementsByGroup(ctx context.Context, groupID string, limit, offset int) ([]models.GroupAnnouncement, error)
	CountAnnouncementsByGroup(ctx context.Context, groupID string) (int64, error)
	ListAnnouncementsForUser(ctx context.Context, userID string, limit, offset int) ([]models.GroupAnnouncement, error)
	CountAnnouncementsForUser(ctx context.Context, userID string) (int64, error)
	UpdateAnnouncement(ctx context.Context, announcementID string, in models.UpdateAnnouncementInput) (models.GroupAnnouncement, error)
	SoftDeleteAnnouncement(ctx context.Context, announcementID string) error

	// Versículo do dia.
	CountVersePool(ctx context.Context, tradition models.Tradition) (int64, error)
	GetVerseByPoolOffset(ctx context.Context, tradition models.Tradition, offset int64) (models.BibleVerse, error)
	GetVerseByID(ctx context.Context, verseID string) (models.BibleVerse, error)
	SetVerseText(ctx context.Context, verseID, text string) error
	HasSharedVerseOn(ctx context.Context, userID, verseID, day string) (bool, error)

	// Compartilhamentos de versículo.
	CreateVerseShare(ctx context.Context, in models.CreateVerseShareInput) (models.VerseShare, error)
	GetVerseShareByID(ctx context.Context, viewerUserID, shareID string) (models.VerseShare, error)
	DeleteVerseShare(ctx context.Context, userID, shareID string) error
	RecordVerseShareAction(ctx context.Context, in models.ReactionInput) error
	ListVerseShareActions(ctx context.Context, viewerUserID, shareID string) ([]models.PrayerActionRecord, error)
	EnrichVerseShares(ctx context.Context, viewerUserID string, items []*models.VerseShare) error

	// Streams de feed. Devolvem linhas cruas (sem enrich), como os List*PrayerRequests
	// dos feeds mesclados: o service fatia a página e só então enriquece.
	ListHomeVerseShares(ctx context.Context, userID string, limit, offset int) ([]models.VerseShare, error)
	CountHomeVerseShares(ctx context.Context, userID string) (int64, error)
	ListPublicVerseShares(ctx context.Context, viewerUserID string, limit, offset int) ([]models.VerseShare, error)
	CountPublicVerseShares(ctx context.Context, viewerUserID string) (int64, error)
	ListFriendsVerseShares(ctx context.Context, userID string, limit, offset int) ([]models.VerseShare, error)
	CountFriendsVerseShares(ctx context.Context, userID string) (int64, error)
	ListGroupsVerseShares(ctx context.Context, userID string, limit, offset int) ([]models.VerseShare, error)
	CountGroupsVerseShares(ctx context.Context, userID string) (int64, error)
	ListVerseSharesByGroup(ctx context.Context, viewerUserID, groupID string, limit, offset int) ([]models.VerseShare, error)
	CountVerseSharesByGroup(ctx context.Context, viewerUserID, groupID string) (int64, error)
}

type PostgresRepository struct {
	db *pgxpool.Pool
}

func NewPostgresRepository(db *pgxpool.Pool) *PostgresRepository {
	return &PostgresRepository{db: db}
}

func (r *PostgresRepository) GetUserByID(ctx context.Context, userID string) (models.User, error) {
	var u models.User
	err := r.db.QueryRow(ctx, `
		SELECT id::text, email, username, display_name, avatar_url, bio, tradition, language, created_at, updated_at
		FROM users
		WHERE id = $1 AND deleted_at IS NULL
	`, userID).Scan(&u.ID, &u.Email, &u.Username, &u.DisplayName, &u.AvatarURL, &u.Bio, &u.Tradition, &u.Language, &u.CreatedAt, &u.UpdatedAt)
	return u, err
}

func (r *PostgresRepository) GetUserByUsername(ctx context.Context, username string) (models.User, error) {
	var u models.User
	err := r.db.QueryRow(ctx, `
		SELECT id::text, email, username, display_name, avatar_url, bio, tradition, language, created_at, updated_at
		FROM users
		WHERE LOWER(username) = LOWER($1) AND deleted_at IS NULL
	`, username).Scan(&u.ID, &u.Email, &u.Username, &u.DisplayName, &u.AvatarURL, &u.Bio, &u.Tradition, &u.Language, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.User{}, ErrUserNotFound
		}
		return models.User{}, err
	}
	return u, nil
}

func (r *PostgresRepository) UpdateUserProfile(ctx context.Context, userID, displayName, username string, avatarURL *string, setAvatar bool, bio *string, setBio bool) (models.User, error) {
	var u models.User
	err := r.db.QueryRow(ctx, `
		UPDATE users
		SET display_name = $2,
		    username = $3,
		    avatar_url = CASE WHEN $5::bool THEN $4 ELSE avatar_url END,
		    bio = CASE WHEN $7::bool THEN $6 ELSE bio END,
		    updated_at = NOW()
		WHERE id = $1 AND deleted_at IS NULL
		RETURNING id::text, email, username, display_name, avatar_url, bio, tradition, language, created_at, updated_at
	`, userID, displayName, username, avatarURL, setAvatar, bio, setBio).Scan(&u.ID, &u.Email, &u.Username, &u.DisplayName, &u.AvatarURL, &u.Bio, &u.Tradition, &u.Language, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" && strings.Contains(pgErr.ConstraintName, "username") {
			return models.User{}, ErrUsernameTaken
		}
	}
	return u, err
}

func (r *PostgresRepository) SetUserTradition(ctx context.Context, userID string, tradition models.Tradition) (models.User, error) {
	var u models.User
	err := r.db.QueryRow(ctx, `
		UPDATE users
		SET tradition = $2, signup_metadata_applied = true, updated_at = NOW()
		WHERE id = $1 AND deleted_at IS NULL
		RETURNING id::text, email, username, display_name, avatar_url, bio, tradition, language, created_at, updated_at
	`, userID, tradition).Scan(&u.ID, &u.Email, &u.Username, &u.DisplayName, &u.AvatarURL, &u.Bio, &u.Tradition, &u.Language, &u.CreatedAt, &u.UpdatedAt)
	return u, err
}

func (r *PostgresRepository) SetUserLanguage(ctx context.Context, userID string, language models.Language) (models.User, error) {
	var u models.User
	err := r.db.QueryRow(ctx, `
		UPDATE users
		SET language = $2, updated_at = NOW()
		WHERE id = $1 AND deleted_at IS NULL
		RETURNING id::text, email, username, display_name, avatar_url, bio, tradition, language, created_at, updated_at
	`, userID, language).Scan(&u.ID, &u.Email, &u.Username, &u.DisplayName, &u.AvatarURL, &u.Bio, &u.Tradition, &u.Language, &u.CreatedAt, &u.UpdatedAt)
	return u, err
}

func (r *PostgresRepository) GetFriendshipState(ctx context.Context, viewerID, ownerID string) (models.PublicFriendshipState, *string, *string, error) {
	if viewerID == ownerID {
		return models.PublicFriendshipSelf, nil, nil, nil
	}
	var (
		id       string
		userID   string
		friendID string
		status   string
	)
	err := r.db.QueryRow(ctx, `
		SELECT id::text, user_id::text, friend_user_id::text, status
		FROM friendships
		WHERE (user_id = $1 AND friend_user_id = $2)
		   OR (user_id = $2 AND friend_user_id = $1)
		LIMIT 1
	`, viewerID, ownerID).Scan(&id, &userID, &friendID, &status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.PublicFriendshipNone, nil, nil, nil
		}
		return "", nil, nil, err
	}
	switch status {
	case "ACCEPTED":
		return models.PublicFriendshipFriend, nil, nil, nil
	case "PENDING":
		idCopy := id
		if userID == viewerID {
			return models.PublicFriendshipPendingOut, nil, &idCopy, nil
		}
		return models.PublicFriendshipPendingIn, &idCopy, nil, nil
	default:
		return models.PublicFriendshipNone, nil, nil, nil
	}
}

// GetUserStats reúne as estatísticas do perfil.
//
// As cinco consultas dependem apenas de userID e viajam num único pgx.Batch:
// cinco idas ao Supabase viravam o custo dominante de abrir a tela de perfil.
func (r *PostgresRepository) GetUserStats(ctx context.Context, userID string) (models.ProfileStats, error) {
	stats := models.ProfileStats{
		PrayerActionsByType:     map[string]int{},
		PrayerActionsByCategory: map[string]int{},
	}

	batch := &pgx.Batch{}
	batch.Queue(`
		SELECT COUNT(*)::int
		FROM prayer_requests
		WHERE author_id = $1 AND deleted_at IS NULL
	`, userID)
	batch.Queue(`
		SELECT action_type, COUNT(*)::int
		FROM prayer_actions
		WHERE user_id = $1
		GROUP BY action_type
	`, userID)
	batch.Queue(`
		SELECT pr.category::text, COUNT(*)::int
		FROM prayer_actions pa
		INNER JOIN prayer_requests pr ON pr.id = pa.prayer_request_id
		WHERE pa.user_id = $1 AND pr.deleted_at IS NULL
		GROUP BY pr.category
	`, userID)
	// Prayers received: count of prayer_actions on every request the user
	// authored (excluding deleted requests).
	batch.Queue(`
		SELECT COUNT(*)::int
		FROM prayer_actions pa
		INNER JOIN prayer_requests pr ON pr.id = pa.prayer_request_id
		WHERE pr.author_id = $1 AND pr.deleted_at IS NULL
	`, userID)
	// Streak: longest run of consecutive days ending today (or yesterday) where
	// the user recorded at least one prayer action. Computed from the distinct
	// day series in prayer_actions. Cheap enough at this scale; if the table
	// grows we can move to a materialized counter or daily cron.
	batch.Queue(`
		WITH days AS (
			SELECT DISTINCT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day
			FROM prayer_actions
			WHERE user_id = $1
		),
		ranked AS (
			SELECT day, day - (ROW_NUMBER() OVER (ORDER BY day))::int AS grp
			FROM days
		),
		runs AS (
			SELECT grp, MAX(day) AS last_day, COUNT(*)::int AS streak
			FROM ranked
			GROUP BY grp
		),
		today AS (
			SELECT (NOW() AT TIME ZONE 'America/Sao_Paulo')::date AS today
		)
		SELECT COALESCE(MAX(streak), 0)::int
		FROM runs, today
		WHERE last_day = today.today OR last_day = today.today - 1
	`, userID)

	br := r.db.SendBatch(ctx, batch)
	defer br.Close()

	if err := br.QueryRow().Scan(&stats.RequestsCreated); err != nil {
		return models.ProfileStats{}, err
	}

	if err := nextBatchRows(br, func(rows pgx.Rows) error {
		for rows.Next() {
			var actionType string
			var count int
			if err := rows.Scan(&actionType, &count); err != nil {
				return err
			}
			stats.PrayerActionsByType[actionType] = count
			stats.PrayerActionsTotal += count
		}
		return nil
	}); err != nil {
		return models.ProfileStats{}, err
	}

	if err := nextBatchRows(br, func(rows pgx.Rows) error {
		for rows.Next() {
			var category string
			var count int
			if err := rows.Scan(&category, &count); err != nil {
				return err
			}
			stats.PrayerActionsByCategory[category] = count
		}
		return nil
	}); err != nil {
		return models.ProfileStats{}, err
	}

	if err := br.QueryRow().Scan(&stats.PrayerActionsReceived); err != nil {
		return models.ProfileStats{}, err
	}
	if err := br.QueryRow().Scan(&stats.StreakDays); err != nil {
		return models.ProfileStats{}, err
	}
	return stats, nil
}

func (r *PostgresRepository) UpsertAuthUser(ctx context.Context, userID, email, preferredUsername, preferredDisplayName, preferredTradition string) error {
	if userID == "" || email == "" {
		return nil
	}
	preferredUsername = strings.TrimSpace(strings.TrimPrefix(strings.ToLower(preferredUsername), "@"))
	preferredDisplayName = strings.TrimSpace(preferredDisplayName)
	preferredTradition = strings.ToUpper(strings.TrimSpace(preferredTradition))
	if preferredTradition != string(models.TraditionCatholic) && preferredTradition != string(models.TraditionEvangelical) {
		preferredTradition = ""
	}
	// O WHERE no DO UPDATE impede que um token ainda válido de uma conta
	// excluída reescreva a linha anonimizada; sem linha devolvida, é conta
	// excluída.
	var syncedID string
	err := r.db.QueryRow(ctx, `
		INSERT INTO users (id, email, username, display_name, tradition)
		VALUES (
			$1,
			$2,
			COALESCE(NULLIF($3, ''), 'user_' || SUBSTRING($1::text, 1, 8)),
			COALESCE(NULLIF($4, ''), SPLIT_PART($2, '@', 1)),
			COALESCE(NULLIF($5, ''), 'CATHOLIC')::tradition
		)
		ON CONFLICT (id) DO UPDATE
		SET
			email = EXCLUDED.email,
			username = CASE
				WHEN users.username = 'user_' || SUBSTRING(users.id::text, 1, 8) AND NULLIF($3, '') IS NOT NULL THEN $3
				ELSE users.username
			END,
			display_name = CASE
				WHEN users.display_name = SPLIT_PART(users.email, '@', 1) AND NULLIF($4, '') IS NOT NULL THEN $4
				ELSE users.display_name
			END,
			updated_at = NOW()
		WHERE users.deleted_at IS NULL
		RETURNING id::text
	`, userID, email, preferredUsername, preferredDisplayName, preferredTradition).Scan(&syncedID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrAccountDeleted
	}
	if err != nil {
		return err
	}
	// O trigger on_auth_user_created já criou a linha no momento do signUp, então
	// o INSERT acima sempre cai no ON CONFLICT e a tradição/username escolhidos no
	// cadastro se perderiam. Aplica a metadata do JWT uma única vez — o WHERE na
	// flag torna a operação idempotente, sem precisar de transação.
	_, err = r.db.Exec(ctx, `
		UPDATE users
		SET
			tradition = COALESCE(NULLIF($3, '')::tradition, tradition),
			username = CASE
				WHEN NULLIF($2, '') IS NOT NULL AND NOT EXISTS (
					SELECT 1 FROM users u2
					WHERE LOWER(u2.username) = LOWER($2)
					  AND u2.id <> $1
					  AND u2.deleted_at IS NULL
				) THEN $2
				ELSE username
			END,
			signup_metadata_applied = true,
			updated_at = NOW()
		WHERE id = $1 AND NOT signup_metadata_applied
	`, userID, preferredUsername, preferredTradition)
	return err
}

func (r *PostgresRepository) UsernameExists(ctx context.Context, username string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM users
			WHERE deleted_at IS NULL
			  AND LOWER(username) = LOWER($1)
		)
	`, username).Scan(&exists)
	return exists, err
}

func (r *PostgresRepository) CreatePrayerRequest(ctx context.Context, in models.CreatePrayerRequestInput) (models.PrayerRequest, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return models.PrayerRequest{}, err
	}
	defer tx.Rollback(ctx)

	requiresModeration := false
	if in.Visibility == models.VisibilityGroupOnly && len(in.GroupIDs) > 0 {
		err = tx.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM groups
				WHERE id = ANY($1::uuid[])
				  AND requires_moderation = true
				  AND deleted_at IS NULL
			)
		`, in.GroupIDs).Scan(&requiresModeration)
		if err != nil {
			return models.PrayerRequest{}, err
		}
	}
	initialStatus := "ACTIVE"
	if requiresModeration {
		initialStatus = "PENDING_REVIEW"
	}

	var pr models.PrayerRequest
	err = tx.QueryRow(ctx, `
		INSERT INTO prayer_requests (author_id, title, body, category, visibility, allow_anonymous, status, tradition)
		VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE((SELECT tradition FROM users WHERE id = $1), 'CATHOLIC'))
		RETURNING id::text, author_id::text, title, body, category, visibility, tradition, allow_anonymous, status, prayed_count, created_at, updated_at
	`, in.AuthorID, in.Title, in.Body, in.Category, in.Visibility, in.AllowAnonymous, initialStatus).
		Scan(&pr.ID, &pr.AuthorID, &pr.Title, &pr.Body, &pr.Category, &pr.Visibility, &pr.Tradition, &pr.AllowAnonymous, &pr.Status, &pr.PrayedCount, &pr.CreatedAt, &pr.UpdatedAt)
	if err != nil {
		return models.PrayerRequest{}, err
	}

	for _, groupID := range in.GroupIDs {
		var canPost bool
		err = tx.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM group_memberships gm
				WHERE gm.group_id = $1
				  AND gm.user_id = $2
				  AND gm.deleted_at IS NULL
			)
		`, groupID, in.AuthorID).Scan(&canPost)
		if err != nil {
			return models.PrayerRequest{}, err
		}
		if !canPost {
			return models.PrayerRequest{}, ErrGroupAccessDenied
		}

		_, err = tx.Exec(ctx, `
			INSERT INTO prayer_request_groups (prayer_request_id, group_id)
			VALUES ($1, $2)
		`, pr.ID, groupID)
		if err != nil {
			return models.PrayerRequest{}, err
		}
	}

	if err = tx.Commit(ctx); err != nil {
		return models.PrayerRequest{}, err
	}

	r.maybeEmitCreatedMilestone(ctx, in.AuthorID)

	return pr, nil
}

func (r *PostgresRepository) UpdatePrayerRequest(ctx context.Context, in models.UpdatePrayerRequestInput) (models.PrayerRequest, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return models.PrayerRequest{}, err
	}
	defer tx.Rollback(ctx)

	ct, err := tx.Exec(ctx, `
		UPDATE prayer_requests
		SET title = $3,
			body = $4,
			category = $5,
			visibility = $6,
			allow_anonymous = $7,
			status = 'ACTIVE',
			updated_at = NOW()
		WHERE id = $1
		  AND author_id = $2
		  AND deleted_at IS NULL
	`, in.RequestID, in.EditorID, in.Title, in.Body, in.Category, in.Visibility, in.AllowAnonymous)
	if err != nil {
		return models.PrayerRequest{}, err
	}
	if ct.RowsAffected() == 0 {
		return models.PrayerRequest{}, ErrPrayerRequestNotFound
	}

	_, err = tx.Exec(ctx, `DELETE FROM prayer_request_groups WHERE prayer_request_id = $1`, in.RequestID)
	if err != nil {
		return models.PrayerRequest{}, err
	}

	for _, groupID := range in.GroupIDs {
		var canPost bool
		err = tx.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM group_memberships gm
				WHERE gm.group_id = $1
				  AND gm.user_id = $2
				  AND gm.deleted_at IS NULL
			)
		`, groupID, in.EditorID).Scan(&canPost)
		if err != nil {
			return models.PrayerRequest{}, err
		}
		if !canPost {
			return models.PrayerRequest{}, ErrGroupAccessDenied
		}

		_, err = tx.Exec(ctx, `
			INSERT INTO prayer_request_groups (prayer_request_id, group_id)
			VALUES ($1, $2)
		`, in.RequestID, groupID)
		if err != nil {
			return models.PrayerRequest{}, err
		}
	}

	var pr models.PrayerRequest
	err = tx.QueryRow(ctx, `
		SELECT id::text, author_id::text, title, body, category, visibility, tradition, allow_anonymous, status, prayed_count, created_at, updated_at
		FROM prayer_requests
		WHERE id = $1
	`, in.RequestID).Scan(&pr.ID, &pr.AuthorID, &pr.Title, &pr.Body, &pr.Category, &pr.Visibility, &pr.Tradition, &pr.AllowAnonymous, &pr.Status, &pr.PrayedCount, &pr.CreatedAt, &pr.UpdatedAt)
	if err != nil {
		return models.PrayerRequest{}, err
	}

	if err = tx.Commit(ctx); err != nil {
		return models.PrayerRequest{}, err
	}
	return pr, nil
}

func (r *PostgresRepository) DeletePrayerRequest(ctx context.Context, userID, requestID string) error {
	ct, err := r.db.Exec(ctx, `
		UPDATE prayer_requests
		SET deleted_at = NOW(), status = 'ARCHIVED', updated_at = NOW()
		WHERE id = $1
		  AND author_id = $2
		  AND deleted_at IS NULL
	`, requestID, userID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrPrayerRequestNotFound
	}
	return nil
}

func (r *PostgresRepository) MarkPrayerRequestAnswered(ctx context.Context, in models.AnswerPrayerRequestInput) (models.PrayerRequest, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return models.PrayerRequest{}, err
	}
	defer tx.Rollback(ctx)

	var testimony *string
	if in.Testimony != "" {
		testimony = &in.Testimony
	}
	ct, err := tx.Exec(ctx, `
		UPDATE prayer_requests
		SET answered_at = COALESCE(answered_at, NOW()),
			testimony = $3,
			updated_at = NOW()
		WHERE id = $1
		  AND author_id = $2
		  AND deleted_at IS NULL
	`, in.RequestID, in.ActorUserID, testimony)
	if err != nil {
		return models.PrayerRequest{}, err
	}
	if ct.RowsAffected() == 0 {
		return models.PrayerRequest{}, ErrPrayerRequestNotFound
	}

	r.notifyPrayersOfRequestAnswered(ctx, tx, in.RequestID, in.ActorUserID)

	if err = tx.Commit(ctx); err != nil {
		return models.PrayerRequest{}, err
	}
	return r.GetPrayerRequestByID(ctx, in.ActorUserID, in.RequestID)
}

func (r *PostgresRepository) ClearPrayerRequestAnswered(ctx context.Context, userID, requestID string) (models.PrayerRequest, error) {
	ct, err := r.db.Exec(ctx, `
		UPDATE prayer_requests
		SET answered_at = NULL,
			testimony = NULL,
			updated_at = NOW()
		WHERE id = $1
		  AND author_id = $2
		  AND deleted_at IS NULL
	`, requestID, userID)
	if err != nil {
		return models.PrayerRequest{}, err
	}
	if ct.RowsAffected() == 0 {
		return models.PrayerRequest{}, ErrPrayerRequestNotFound
	}
	return r.GetPrayerRequestByID(ctx, userID, requestID)
}

// prayerRequestVisibleTo é o predicado canônico de visibilidade de um pedido
// (alias pr) para um viewer. Toda leitura ou escrita que dependa de "o viewer
// enxerga este pedido" usa este mesmo texto, para as regras não divergirem
// entre o detalhe, as reações e as listas penduradas no pedido.
//
//   - o autor sempre vê o que é seu, mesmo depois de trocar de tradição e mesmo
//     com o pedido em PENDING_REVIEW;
//   - os demais só veem pedidos ACTIVE da própria tradição, PUBLIC ou de um
//     grupo do qual são membros, e nunca com bloqueio em qualquer direção.
//
// viewer é a expressão SQL do id do viewer (ex.: "$2::uuid").
func prayerRequestVisibleTo(viewer string) string {
	return strings.ReplaceAll(`
		pr.deleted_at IS NULL
		AND (
			pr.author_id = :viewer
			OR (
				pr.status = 'ACTIVE'
				AND pr.tradition = COALESCE(
					(SELECT tradition FROM users WHERE id = :viewer AND deleted_at IS NULL),
					pr.tradition
				)
				AND (
					pr.visibility = 'PUBLIC'
					OR (pr.visibility = 'GROUP_ONLY' AND EXISTS (
						SELECT 1
						FROM prayer_request_groups prg
						INNER JOIN group_memberships gm ON gm.group_id = prg.group_id
						WHERE prg.prayer_request_id = pr.id
						  AND gm.user_id = :viewer
						  AND gm.deleted_at IS NULL
					))
				)
				AND NOT EXISTS (
					SELECT 1 FROM user_blocks ub
					WHERE (ub.blocker_user_id = :viewer AND ub.blocked_user_id = pr.author_id)
					   OR (ub.blocked_user_id = :viewer AND ub.blocker_user_id = pr.author_id)
				)
			)
		)`, ":viewer", viewer)
}

var getPrayerRequestByIDSQL = `
	SELECT pr.id::text, pr.author_id::text, pr.title, pr.body, pr.category, pr.visibility, pr.tradition,
	       pr.allow_anonymous, pr.status, pr.prayed_count, pr.created_at, pr.updated_at
	FROM prayer_requests pr
	WHERE pr.id = $1::uuid AND ` + prayerRequestVisibleTo("$2::uuid")

var prayerRequestAccessSQL = `
	SELECT pr.author_id::text, pr.allow_anonymous
	FROM prayer_requests pr
	WHERE pr.id = $1::uuid AND ` + prayerRequestVisibleTo("$2::uuid")

// GetPrayerRequestAccess devolve autoria e anonimato de um pedido visível ao
// viewer. Uma viagem, sem enrich: serve para quem só precisa decidir permissão.
func (r *PostgresRepository) GetPrayerRequestAccess(ctx context.Context, viewerUserID, requestID string) (models.PrayerRequestAccess, error) {
	var access models.PrayerRequestAccess
	err := r.db.QueryRow(ctx, prayerRequestAccessSQL, requestID, viewerUserID).Scan(&access.AuthorID, &access.AllowAnonymous)
	if errors.Is(err, pgx.ErrNoRows) {
		return access, ErrPrayerRequestNotFound
	}
	return access, err
}

func (r *PostgresRepository) GetPrayerRequestByID(ctx context.Context, userID, requestID string) (models.PrayerRequest, error) {
	var pr models.PrayerRequest
	err := r.db.QueryRow(ctx, getPrayerRequestByIDSQL, requestID, userID).Scan(&pr.ID, &pr.AuthorID, &pr.Title, &pr.Body, &pr.Category, &pr.Visibility, &pr.Tradition, &pr.AllowAnonymous, &pr.Status, &pr.PrayedCount, &pr.CreatedAt, &pr.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.PrayerRequest{}, ErrPrayerRequestNotFound
		}
		return models.PrayerRequest{}, err
	}

	items := []models.PrayerRequest{pr}
	if err = r.enrichPrayerRequests(ctx, userID, items); err != nil {
		return models.PrayerRequest{}, err
	}
	return items[0], nil
}

func (r *PostgresRepository) ListPublicPrayerRequests(ctx context.Context, viewerUserID string, limit, offset int) ([]models.PrayerRequest, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id::text, author_id::text, title, body, category, visibility, tradition, allow_anonymous, status, prayed_count, created_at, updated_at
		FROM prayer_requests
		WHERE visibility = 'PUBLIC' AND status = 'ACTIVE' AND deleted_at IS NULL
		  AND tradition = COALESCE(
			(SELECT tradition FROM users WHERE id = NULLIF($3, '')::uuid AND deleted_at IS NULL),
			prayer_requests.tradition
		  )
		  AND NOT EXISTS (
			SELECT 1 FROM user_blocks ub
			WHERE NULLIF($3, '')::uuid IS NOT NULL
			  AND ((ub.blocker_user_id = NULLIF($3, '')::uuid AND ub.blocked_user_id = prayer_requests.author_id)
				OR (ub.blocked_user_id = NULLIF($3, '')::uuid AND ub.blocker_user_id = prayer_requests.author_id))
		  )
		ORDER BY created_at DESC
		LIMIT $1 OFFSET $2
	`, limit, offset, viewerUserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Devolve linhas cruas: o feed público é mesclado no service, que fatia a
	// página e só então enriquece. Enriquecer aqui duplicaria o trabalho.
	return scanPrayerRequests(rows)
}

func (r *PostgresRepository) CountPublicPrayerRequests(ctx context.Context, viewerUserID string) (int64, error) {
	var total int64
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)::bigint
		FROM prayer_requests
		WHERE visibility = 'PUBLIC' AND status = 'ACTIVE' AND deleted_at IS NULL
		  AND tradition = COALESCE(
			(SELECT tradition FROM users WHERE id = NULLIF($1, '')::uuid AND deleted_at IS NULL),
			prayer_requests.tradition
		  )
		  AND NOT EXISTS (
			SELECT 1 FROM user_blocks ub
			WHERE NULLIF($1, '')::uuid IS NOT NULL
			  AND ((ub.blocker_user_id = NULLIF($1, '')::uuid AND ub.blocked_user_id = prayer_requests.author_id)
				OR (ub.blocked_user_id = NULLIF($1, '')::uuid AND ub.blocker_user_id = prayer_requests.author_id))
		  )
	`, viewerUserID).Scan(&total)
	return total, err
}

// ErrPrayerActionNotAllowed indica um tipo de oração que não pertence à
// tradição do usuário. O service traduz para a sua própria sentinela de
// validação.
var ErrPrayerActionNotAllowed = errors.New("prayer action not allowed for tradition")

// reactionSQL monta o statement único de uma reação.
//
// Uma reação precisava de cinco a sete idas ao banco em série: ler o usuário
// para descobrir a tradição, checar a visibilidade do alvo, inserir, atualizar
// o contador, notificar e checar dois marcos. Aqui a parte que decide o
// resultado vira um só statement com CTEs de escrita:
//
//   - viewer resolve o tipo padrão e valida o tipo pedido contra a tradição;
//   - target aplica o predicado canônico de visibilidade (o mesmo do GET);
//   - inserted grava só se o tipo vale, o alvo é visível e não há reação igual
//     dentro da janela;
//   - afterInsert (opcional) roda sobre o que foi inserido, na mesma
//     transação: é o contador desnormalizado dos pedidos.
//
// A linha final devolve os quatro fatos que o chamador precisa para escolher o
// erro certo, sem outra consulta. Parâmetros: $1 viewer, $2 alvo, $3 tipo
// (vazio = padrão), $4/$5 tipos católicos/evangélicos em CSV, $6/$7 padrões,
// $8 janela em horas.
func reactionSQL(target, column, afterInsert string) string {
	return `
		WITH viewer AS (
			SELECT
				u.id,
				COALESCE(NULLIF($3, ''), CASE WHEN u.tradition = 'EVANGELICAL' THEN $7 ELSE $6 END) AS action_type,
				string_to_array(CASE WHEN u.tradition = 'EVANGELICAL' THEN $5 ELSE $4 END, ',') AS allowed
			FROM users u
			WHERE u.id = $1::uuid AND u.deleted_at IS NULL
		),
		target AS (` + target + `),
		inserted AS (
			INSERT INTO prayer_actions (user_id, ` + column + `, action_type)
			SELECT v.id, t.id, v.action_type
			FROM viewer v, target t
			WHERE v.action_type = ANY (v.allowed)
			  AND NOT EXISTS (
				SELECT 1 FROM prayer_actions pa
				WHERE pa.user_id = v.id
				  AND pa.` + column + ` = t.id
				  AND pa.action_type = v.action_type
				  AND pa.created_at > NOW() - make_interval(hours => $8::int)
			  )
			RETURNING ` + column + ` AS subject_id
		)` + afterInsert + `
		SELECT
			COALESCE((SELECT action_type = ANY (allowed) FROM viewer), false),
			EXISTS (SELECT 1 FROM target),
			EXISTS (SELECT 1 FROM inserted),
			COALESCE((SELECT action_type FROM viewer), ''),
			COALESCE((SELECT author_id::text FROM target), '')
	`
}

var recordPrayerActionSQL = reactionSQL(
	`SELECT pr.id, pr.author_id FROM prayer_requests pr WHERE pr.id = $2::uuid AND `+prayerRequestVisibleTo("$1::uuid"),
	"prayer_request_id",
	`,
		bumped AS (
			UPDATE prayer_requests
			SET prayed_count = prayed_count + 1, updated_at = NOW()
			WHERE id IN (SELECT subject_id FROM inserted)
		)`,
)

// recordReaction executa o statement de reação e traduz o resultado em erro.
// Com a reação gravada, dispara os efeitos colaterais best-effort.
func (r *PostgresRepository) recordReaction(ctx context.Context, sql string, in models.ReactionInput, notFound error, notifType models.NotificationType, subjectType models.NotificationSubjectType) error {
	var (
		actionAllowed, targetVisible, inserted bool
		actionType, authorID                   string
	)
	err := r.db.QueryRow(ctx, sql,
		in.UserID, in.SubjectID, string(in.ActionType),
		actionTypesCSV(in.Rules.Catholic), actionTypesCSV(in.Rules.Evangelical),
		string(in.Rules.CatholicDefault), string(in.Rules.EvangelicalDefault),
		in.WindowHours,
	).Scan(&actionAllowed, &targetVisible, &inserted, &actionType, &authorID)
	if err != nil {
		return err
	}
	switch {
	case !actionAllowed:
		return ErrPrayerActionNotAllowed
	case !targetVisible:
		return notFound
	case !inserted:
		return ErrDuplicatePrayedAction
	}
	r.emitReactionSideEffects(ctx, in.UserID, authorID, in.SubjectID, actionType, notifType, subjectType)
	return nil
}

// RecordPrayerAction registra uma reação num pedido visível ao usuário.
// Uma viagem decide e grava; uma segunda leva os efeitos colaterais.
func (r *PostgresRepository) RecordPrayerAction(ctx context.Context, in models.ReactionInput) error {
	return r.recordReaction(ctx, recordPrayerActionSQL, in, ErrPrayerRequestNotFound,
		models.NotificationTypePrayed, models.NotificationSubjectPrayerRequest)
}

var prayedMilestones = []int{10, 50, 100, 500, 1000}
var createdMilestones = []int{1, 10, 50, 100}
var streakMilestones = []int{7, 30, 100, 365}

// reactionNotifySQL avisa o autor. O NOT EXISTS aplica a janela de 60 minutos
// para que reagir várias vezes ao mesmo conteúdo não vire enxurrada.
const reactionNotifySQL = `
	INSERT INTO notifications (user_id, type, actor_user_id, subject_type, subject_id, payload)
	SELECT $1::uuid, $2, $3::uuid, $4, $5::uuid, jsonb_build_object('actionType', $6::text)
	WHERE NOT EXISTS (
		SELECT 1 FROM notifications n
		WHERE n.user_id = $1::uuid
		  AND n.type = $2
		  AND n.actor_user_id = $3::uuid
		  AND n.subject_id = $5::uuid
		  AND n.created_at > NOW() - INTERVAL '60 minutes'
	)
`

// prayedMilestoneSQL emite MILESTONE_PRAYED quando o total de reações do
// usuário bate exatamente um marco. Idempotente: cada marco é cruzado uma vez.
const prayedMilestoneSQL = `
	INSERT INTO notifications (user_id, type, subject_type, subject_id, payload)
	SELECT $1::uuid, $2, $3, $1::uuid, jsonb_build_object('count', c.total)
	FROM (SELECT COUNT(*)::int AS total FROM prayer_actions WHERE user_id = $1::uuid) c
	WHERE c.total = ANY (string_to_array($4, ',')::int[])
`

// streakMilestoneSQL emite MILESTONE_STREAK na primeira reação do dia (fuso de
// São Paulo) quando a sequência de dias bate um marco. Idempotente: a porta
// "primeira do dia" só abre uma vez por dia.
const streakMilestoneSQL = `
	WITH today AS (
		SELECT (NOW() AT TIME ZONE 'America/Sao_Paulo')::date AS day
	),
	first_today AS (
		SELECT COUNT(*) = 1 AS ok
		FROM prayer_actions pa, today
		WHERE pa.user_id = $1::uuid
		  AND (pa.created_at AT TIME ZONE 'America/Sao_Paulo')::date = today.day
	),
	days AS (
		SELECT DISTINCT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day
		FROM prayer_actions
		WHERE user_id = $1::uuid
	),
	ranked AS (
		SELECT day, day - (ROW_NUMBER() OVER (ORDER BY day))::int AS grp
		FROM days
	),
	runs AS (
		SELECT MAX(day) AS last_day, COUNT(*)::int AS streak
		FROM ranked
		GROUP BY grp
	),
	current_streak AS (
		SELECT COALESCE(MAX(runs.streak), 0)::int AS days
		FROM runs, today
		WHERE runs.last_day = today.day OR runs.last_day = today.day - 1
	)
	INSERT INTO notifications (user_id, type, subject_type, subject_id, payload)
	SELECT $1::uuid, $2, $3, $1::uuid, jsonb_build_object('days', s.days)
	FROM current_streak s, first_today f
	WHERE f.ok AND s.days = ANY (string_to_array($4, ',')::int[])
`

// emitReactionSideEffects manda num único batch a notificação ao autor e os
// dois marcos. Tudo é best-effort: a reação já foi gravada, então uma falha
// aqui só é registrada. Com simple protocol o batch roda numa transação
// implícita, logo uma falha descarta o batch inteiro — aceitável para efeitos
// que nunca podem derrubar a ação principal.
//
// Não dá para ir junto com a reação: ela precisa estar confirmada antes, e o
// autor só é conhecido depois dela.
func (r *PostgresRepository) emitReactionSideEffects(ctx context.Context, userID, authorID, subjectID, actionType string, notifType models.NotificationType, subjectType models.NotificationSubjectType) {
	batch := &pgx.Batch{}
	if authorID != "" && authorID != userID {
		batch.Queue(reactionNotifySQL, authorID, string(notifType), userID, string(subjectType), subjectID, actionType)
	}
	batch.Queue(prayedMilestoneSQL, userID, string(models.NotificationTypeMilestonePrayed),
		string(models.NotificationSubjectMilestone), intsCSV(prayedMilestones))
	batch.Queue(streakMilestoneSQL, userID, string(models.NotificationTypeMilestoneStreak),
		string(models.NotificationSubjectMilestone), intsCSV(streakMilestones))

	br := r.db.SendBatch(ctx, batch)
	for i := 0; i < batch.Len(); i++ {
		if _, err := br.Exec(); err != nil {
			log.Printf("reaction side effects failed: subject=%s actor=%s err=%v", subjectID, userID, err)
			break
		}
	}
	if err := br.Close(); err != nil {
		log.Printf("reaction side effects close failed: subject=%s actor=%s err=%v", subjectID, userID, err)
	}
}

func actionTypesCSV(types []models.PrayerActionType) string {
	parts := make([]string, len(types))
	for i, t := range types {
		parts[i] = string(t)
	}
	return strings.Join(parts, ",")
}

func intsCSV(values []int) string {
	parts := make([]string, len(values))
	for i, v := range values {
		parts[i] = strconv.Itoa(v)
	}
	return strings.Join(parts, ",")
}

// maybeEmitCreatedMilestone fires MILESTONE_CREATED when the user crosses an
// "intentions shared" threshold.
func (r *PostgresRepository) maybeEmitCreatedMilestone(ctx context.Context, userID string) {
	var total int
	if err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM prayer_requests WHERE author_id = $1 AND deleted_at IS NULL
	`, userID).Scan(&total); err != nil {
		return
	}
	for _, m := range createdMilestones {
		if total == m {
			_ = insertNotificationOn(ctx, r.db, models.CreateNotificationInput{
				UserID:      userID,
				Type:        models.NotificationTypeMilestoneCreated,
				SubjectType: models.NotificationSubjectMilestone,
				SubjectID:   userID,
				Payload:     map[string]any{"count": m},
			})
			return
		}
	}
}

func (r *PostgresRepository) ListGroupsPrayerRequests(ctx context.Context, userID string, limit, offset int) ([]models.PrayerRequest, error) {
	rows, err := r.db.Query(ctx, `
		SELECT DISTINCT pr.id::text, pr.author_id::text, pr.title, pr.body, pr.category, pr.visibility, pr.tradition, pr.allow_anonymous, pr.status, pr.prayed_count, pr.created_at, pr.updated_at
		FROM prayer_requests pr
		INNER JOIN prayer_request_groups prg ON prg.prayer_request_id = pr.id
		INNER JOIN group_memberships gm ON gm.group_id = prg.group_id
		WHERE gm.user_id = $1
			AND gm.deleted_at IS NULL
			AND pr.status = 'ACTIVE'
			AND pr.deleted_at IS NULL
			AND pr.tradition = (SELECT tradition FROM users WHERE id = $1 AND deleted_at IS NULL)
			AND NOT EXISTS (
				SELECT 1 FROM user_blocks ub
				WHERE (ub.blocker_user_id = $1 AND ub.blocked_user_id = pr.author_id)
				   OR (ub.blocked_user_id = $1 AND ub.blocker_user_id = pr.author_id)
			)
		ORDER BY pr.created_at DESC
		LIMIT $2 OFFSET $3
	`, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	// Sem enrich aqui: o feed mesclado (service.ListGroupsFeed) fatia a página
	// antes e enriquece só os itens retornados via EnrichPrayerRequests.
	return scanPrayerRequests(rows)
}

func (r *PostgresRepository) CountGroupsPrayerRequests(ctx context.Context, userID string) (int64, error) {
	var total int64
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)::bigint
		FROM (
			SELECT DISTINCT pr.id
			FROM prayer_requests pr
			INNER JOIN prayer_request_groups prg ON prg.prayer_request_id = pr.id
			INNER JOIN group_memberships gm ON gm.group_id = prg.group_id
			WHERE gm.user_id = $1
			  AND gm.deleted_at IS NULL
			  AND pr.status = 'ACTIVE'
			  AND pr.deleted_at IS NULL
			  AND pr.tradition = (SELECT tradition FROM users WHERE id = $1 AND deleted_at IS NULL)
			  AND NOT EXISTS (
				SELECT 1 FROM user_blocks ub
				WHERE (ub.blocker_user_id = $1 AND ub.blocked_user_id = pr.author_id)
				   OR (ub.blocked_user_id = $1 AND ub.blocker_user_id = pr.author_id)
			  )
		) AS group_requests
	`, userID).Scan(&total)
	return total, err
}

func (r *PostgresRepository) ListFriendsPrayerRequests(ctx context.Context, userID string, limit, offset int) ([]models.PrayerRequest, error) {
	rows, err := r.db.Query(ctx, `
		WITH friend_ids AS (
			SELECT CASE WHEN user_id = $1 THEN friend_user_id ELSE user_id END AS friend_id
			FROM friendships
			WHERE status = 'ACCEPTED' AND (user_id = $1 OR friend_user_id = $1)
		)
		SELECT pr.id::text, pr.author_id::text, pr.title, pr.body, pr.category, pr.visibility, pr.tradition, pr.allow_anonymous, pr.status, pr.prayed_count, pr.created_at, pr.updated_at
		FROM prayer_requests pr
		INNER JOIN friend_ids f ON f.friend_id = pr.author_id
		WHERE pr.visibility = 'PUBLIC'
			AND pr.status = 'ACTIVE'
			AND pr.deleted_at IS NULL
			AND pr.tradition = (SELECT tradition FROM users WHERE id = $1 AND deleted_at IS NULL)
		ORDER BY pr.created_at DESC
		LIMIT $2 OFFSET $3
	`, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	// Idem ao feed público: cru, porque o service enriquece a página final.
	return scanPrayerRequests(rows)
}

func (r *PostgresRepository) CountFriendsPrayerRequests(ctx context.Context, userID string) (int64, error) {
	var total int64
	err := r.db.QueryRow(ctx, `
		WITH friend_ids AS (
			SELECT CASE WHEN user_id = $1 THEN friend_user_id ELSE user_id END AS friend_id
			FROM friendships
			WHERE status = 'ACCEPTED' AND (user_id = $1 OR friend_user_id = $1)
		)
		SELECT COUNT(*)::bigint
		FROM prayer_requests pr
		INNER JOIN friend_ids f ON f.friend_id = pr.author_id
		WHERE pr.visibility = 'PUBLIC'
		  AND pr.status = 'ACTIVE'
		  AND pr.deleted_at IS NULL
		  AND pr.tradition = (SELECT tradition FROM users WHERE id = $1 AND deleted_at IS NULL)
	`, userID).Scan(&total)
	return total, err
}

func (r *PostgresRepository) ListHomePrayerRequests(ctx context.Context, userID string, limit, offset int) ([]models.PrayerRequest, error) {
	rows, err := r.db.Query(ctx, `
		WITH viewer AS (
			SELECT tradition FROM users WHERE id = $1 AND deleted_at IS NULL
		),
		friend_ids AS (
			SELECT CASE WHEN user_id = $1 THEN friend_user_id ELSE user_id END AS friend_id
			FROM friendships
			WHERE status = 'ACCEPTED' AND (user_id = $1 OR friend_user_id = $1)
		),
		blocked_ids AS (
			SELECT blocked_user_id AS uid FROM user_blocks WHERE blocker_user_id = $1
			UNION
			SELECT blocker_user_id AS uid FROM user_blocks WHERE blocked_user_id = $1
		),
		home_requests AS (
			SELECT pr.id, pr.author_id, pr.title, pr.body, pr.category, pr.visibility, pr.tradition, pr.allow_anonymous, pr.status, pr.prayed_count, pr.created_at, pr.updated_at
			FROM prayer_requests pr
			WHERE pr.author_id = $1
			  AND pr.status IN ('ACTIVE', 'PENDING_REVIEW')
			  AND pr.deleted_at IS NULL
			UNION
			SELECT pr.id, pr.author_id, pr.title, pr.body, pr.category, pr.visibility, pr.tradition, pr.allow_anonymous, pr.status, pr.prayed_count, pr.created_at, pr.updated_at
			FROM prayer_requests pr
			INNER JOIN friend_ids f ON f.friend_id = pr.author_id
			WHERE pr.visibility = 'PUBLIC' AND pr.status = 'ACTIVE' AND pr.deleted_at IS NULL
			  AND pr.tradition = (SELECT tradition FROM viewer)
			  AND pr.author_id NOT IN (SELECT uid FROM blocked_ids)
			UNION
			SELECT pr.id, pr.author_id, pr.title, pr.body, pr.category, pr.visibility, pr.tradition, pr.allow_anonymous, pr.status, pr.prayed_count, pr.created_at, pr.updated_at
			FROM prayer_requests pr
			INNER JOIN prayer_request_groups prg ON prg.prayer_request_id = pr.id
			INNER JOIN group_memberships gm ON gm.group_id = prg.group_id
			WHERE gm.user_id = $1 AND gm.deleted_at IS NULL AND pr.status = 'ACTIVE' AND pr.deleted_at IS NULL
			  AND pr.tradition = (SELECT tradition FROM viewer)
			  AND pr.author_id NOT IN (SELECT uid FROM blocked_ids)
		)
		SELECT id::text, author_id::text, title, body, category, visibility, tradition, allow_anonymous, status, prayed_count, created_at, updated_at
		FROM home_requests
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	// Sem enrich aqui: o feed mesclado (service.ListHomeFeed) fatia a página
	// antes e enriquece só os itens retornados via EnrichPrayerRequests.
	return scanPrayerRequests(rows)
}

func (r *PostgresRepository) CountHomePrayerRequests(ctx context.Context, userID string) (int64, error) {
	var total int64
	err := r.db.QueryRow(ctx, `
		WITH viewer AS (
			SELECT tradition FROM users WHERE id = $1 AND deleted_at IS NULL
		),
		friend_ids AS (
			SELECT CASE WHEN user_id = $1 THEN friend_user_id ELSE user_id END AS friend_id
			FROM friendships
			WHERE status = 'ACCEPTED' AND (user_id = $1 OR friend_user_id = $1)
		),
		blocked_ids AS (
			SELECT blocked_user_id AS uid FROM user_blocks WHERE blocker_user_id = $1
			UNION
			SELECT blocker_user_id AS uid FROM user_blocks WHERE blocked_user_id = $1
		),
		home_requests AS (
			SELECT pr.id
			FROM prayer_requests pr
			WHERE pr.author_id = $1
			  AND pr.status IN ('ACTIVE', 'PENDING_REVIEW')
			  AND pr.deleted_at IS NULL
			UNION
			SELECT pr.id
			FROM prayer_requests pr
			INNER JOIN friend_ids f ON f.friend_id = pr.author_id
			WHERE pr.visibility = 'PUBLIC' AND pr.status = 'ACTIVE' AND pr.deleted_at IS NULL
			  AND pr.tradition = (SELECT tradition FROM viewer)
			  AND pr.author_id NOT IN (SELECT uid FROM blocked_ids)
			UNION
			SELECT pr.id
			FROM prayer_requests pr
			INNER JOIN prayer_request_groups prg ON prg.prayer_request_id = pr.id
			INNER JOIN group_memberships gm ON gm.group_id = prg.group_id
			WHERE gm.user_id = $1 AND gm.deleted_at IS NULL AND pr.status = 'ACTIVE' AND pr.deleted_at IS NULL
			  AND pr.tradition = (SELECT tradition FROM viewer)
			  AND pr.author_id NOT IN (SELECT uid FROM blocked_ids)
		)
		SELECT COUNT(*)::bigint
		FROM home_requests
	`, userID).Scan(&total)
	return total, err
}

func (r *PostgresRepository) ListUserGroups(ctx context.Context, userID string) ([]models.Group, error) {
	rows, err := r.db.Query(ctx, `
		SELECT g.id::text, g.name, g.description, g.image_url, g.join_policy, g.requires_moderation, g.created_by::text, g.created_at, g.updated_at
		FROM groups g
		INNER JOIN group_memberships gm ON gm.group_id = g.id
		WHERE gm.user_id = $1 AND gm.deleted_at IS NULL AND g.deleted_at IS NULL
		ORDER BY g.created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]models.Group, 0)
	for rows.Next() {
		var g models.Group
		err = rows.Scan(&g.ID, &g.Name, &g.Description, &g.ImageURL, &g.JoinPolicy, &g.RequiresModeration, &g.CreatedBy, &g.CreatedAt, &g.UpdatedAt)
		if err != nil {
			return nil, err
		}
		items = append(items, g)
	}
	return items, rows.Err()
}

func (r *PostgresRepository) SearchGroupsByName(ctx context.Context, userID, query string, limit int) ([]models.GroupSummary, error) {
	if limit <= 0 || limit > 30 {
		limit = 20
	}
	rows, err := r.db.Query(ctx, `
		SELECT
			g.id::text,
			g.name,
			g.description,
			g.join_policy,
			EXISTS (
				SELECT 1
				FROM group_memberships gm
				WHERE gm.group_id = g.id
				  AND gm.user_id = $1
				  AND gm.deleted_at IS NULL
			) AS is_member
		FROM groups g
		WHERE g.deleted_at IS NULL
		  AND (
			g.name ILIKE '%' || $2 || '%'
			OR g.description ILIKE '%' || $2 || '%'
		  )
		ORDER BY g.name ASC
		LIMIT $3
	`, userID, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]models.GroupSummary, 0)
	for rows.Next() {
		var item models.GroupSummary
		if err = rows.Scan(&item.ID, &item.Name, &item.Description, &item.JoinPolicy, &item.IsMember); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *PostgresRepository) CreateGroup(ctx context.Context, userID, name, description string, imageURL *string, joinPolicy models.GroupJoinPolicy) (models.Group, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return models.Group{}, err
	}
	defer tx.Rollback(ctx)

	var g models.Group
	err = tx.QueryRow(ctx, `
		INSERT INTO groups (name, description, image_url, join_policy, created_by)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id::text, name, description, image_url, join_policy, requires_moderation, created_by::text, created_at, updated_at
	`, name, description, imageURL, joinPolicy, userID).Scan(&g.ID, &g.Name, &g.Description, &g.ImageURL, &g.JoinPolicy, &g.RequiresModeration, &g.CreatedBy, &g.CreatedAt, &g.UpdatedAt)
	if err != nil {
		return models.Group{}, err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO group_memberships (group_id, user_id, role)
		VALUES ($1, $2, 'ADMIN')
	`, g.ID, userID)
	if err != nil {
		return models.Group{}, err
	}

	if err = tx.Commit(ctx); err != nil {
		return models.Group{}, err
	}
	return g, nil
}

func (r *PostgresRepository) RequestJoinGroup(ctx context.Context, userID, groupID string) error {
	var joinPolicy models.GroupJoinPolicy
	err := r.db.QueryRow(ctx, `
		SELECT join_policy
		FROM groups
		WHERE id = $1 AND deleted_at IS NULL
	`, groupID).Scan(&joinPolicy)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrGroupNotFound
		}
		return err
	}

	switch joinPolicy {
	case models.JoinPolicyOpen:
		_, err = r.db.Exec(ctx, `
			INSERT INTO group_memberships (group_id, user_id, role)
			VALUES ($1, $2, 'MEMBER')
			ON CONFLICT (group_id, user_id) DO UPDATE SET deleted_at = NULL, updated_at = NOW()
		`, groupID, userID)
		return err
	case models.JoinPolicyRequest:
		_, err = r.db.Exec(ctx, `
			INSERT INTO group_join_requests (group_id, user_id, status)
			VALUES ($1, $2, 'PENDING')
			ON CONFLICT (group_id, user_id) DO UPDATE SET status = 'PENDING', requested_at = NOW(), reviewed_at = NULL, reviewed_by = NULL
		`, groupID, userID)
		if err != nil {
			return err
		}
		r.notifyGroupAdminsOfJoinRequest(ctx, userID, groupID)
		return nil
	default:
		return ErrInviteOnlyGroup
	}
}

func (r *PostgresRepository) ListGroupJoinRequests(ctx context.Context, actorUserID, groupID string) ([]models.GroupJoinRequest, error) {
	ok, err := r.isGroupAdmin(ctx, actorUserID, groupID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrGroupAdminRequired
	}

	rows, err := r.db.Query(ctx, `
		SELECT gjr.id::text, gjr.group_id::text, gjr.user_id::text,
		       u.username, u.display_name, u.avatar_url,
		       gjr.status, gjr.requested_at
		FROM group_join_requests gjr
		INNER JOIN users u ON u.id = gjr.user_id
		WHERE gjr.group_id = $1 AND gjr.status = 'PENDING' AND u.deleted_at IS NULL
		ORDER BY gjr.requested_at ASC
	`, groupID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]models.GroupJoinRequest, 0)
	for rows.Next() {
		var req models.GroupJoinRequest
		err = rows.Scan(&req.ID, &req.GroupID, &req.UserID, &req.Username, &req.DisplayName, &req.AvatarURL, &req.Status, &req.RequestedAt)
		if err != nil {
			return nil, err
		}
		items = append(items, req)
	}
	return items, rows.Err()
}

func (r *PostgresRepository) RejectGroupJoinRequest(ctx context.Context, actorUserID, groupID, requestID string) error {
	ok, err := r.isGroupAdmin(ctx, actorUserID, groupID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrGroupAdminRequired
	}

	ct, err := r.db.Exec(ctx, `
		UPDATE group_join_requests
		SET status = 'REJECTED', reviewed_at = NOW(), reviewed_by = $1
		WHERE id = $2 AND group_id = $3 AND status = 'PENDING'
	`, actorUserID, requestID, groupID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrJoinRequestNotFound
	}
	return nil
}

func (r *PostgresRepository) ApproveGroupJoinRequest(ctx context.Context, actorUserID, groupID, requestID string) error {
	ok, err := r.isGroupAdmin(ctx, actorUserID, groupID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrGroupAdminRequired
	}

	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var userID string
	err = tx.QueryRow(ctx, `
		UPDATE group_join_requests
		SET status = 'APPROVED', reviewed_at = NOW(), reviewed_by = $1
		WHERE id = $2 AND group_id = $3 AND status = 'PENDING'
		RETURNING user_id::text
	`, actorUserID, requestID, groupID).Scan(&userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrJoinRequestNotFound
		}
		return err
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO group_memberships (group_id, user_id, role)
		VALUES ($1, $2, 'MEMBER')
		ON CONFLICT (group_id, user_id) DO UPDATE SET deleted_at = NULL, updated_at = NOW()
	`, groupID, userID)
	if err != nil {
		return err
	}

	actor := actorUserID
	_ = insertNotificationOn(ctx, tx, models.CreateNotificationInput{
		UserID:      userID,
		Type:        models.NotificationTypeGroupJoinApproved,
		ActorUserID: &actor,
		SubjectType: models.NotificationSubjectGroup,
		SubjectID:   groupID,
		Payload:     map[string]any{},
	})

	return tx.Commit(ctx)
}

// isGroupAdmin diz se o usuário administra o grupo, devolvendo
// ErrGroupNotFound quando o grupo não existe (mesma viagem).
func (r *PostgresRepository) isGroupAdmin(ctx context.Context, userID, groupID string) (bool, error) {
	var isAdmin bool
	err := r.db.QueryRow(ctx, `
		SELECT COALESCE(g.created_by = $1::uuid OR gm.role = 'ADMIN', false)
		FROM groups g
		LEFT JOIN group_memberships gm ON gm.group_id = g.id AND gm.user_id = $1::uuid AND gm.deleted_at IS NULL
		WHERE g.id = $2::uuid AND g.deleted_at IS NULL
	`, userID, groupID).Scan(&isAdmin)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, ErrGroupNotFound
	}
	return isAdmin, err
}

func scanPrayerRequests(rows pgx.Rows) ([]models.PrayerRequest, error) {
	items := make([]models.PrayerRequest, 0)
	for rows.Next() {
		var pr models.PrayerRequest
		err := rows.Scan(&pr.ID, &pr.AuthorID, &pr.Title, &pr.Body, &pr.Category, &pr.Visibility, &pr.Tradition, &pr.AllowAnonymous, &pr.Status, &pr.PrayedCount, &pr.CreatedAt, &pr.UpdatedAt)
		if err != nil {
			return nil, err
		}
		items = append(items, pr)
	}
	return items, rows.Err()
}

func (r *PostgresRepository) enrichPrayerRequests(ctx context.Context, userID string, items []models.PrayerRequest) error {
	refs := make([]*models.PrayerRequest, len(items))
	for i := range items {
		refs[i] = &items[i]
	}
	return r.EnrichPrayerRequests(ctx, userID, refs)
}

// nextBatchRows consome o próximo resultado de um batch, na ordem em que foi
// enfileirado, garantindo o Close mesmo quando o scan falha.
func nextBatchRows(br pgx.BatchResults, scan func(pgx.Rows) error) error {
	rows, err := br.Query()
	if err != nil {
		return err
	}
	defer rows.Close()
	if err := scan(rows); err != nil {
		return err
	}
	return rows.Err()
}

// enrichedAuthor são os campos de autor que os enriquecimentos denormalizam.
type enrichedAuthor struct {
	username    string
	displayName string
	avatarURL   *string
}

// scanAuthors lê o resultado da consulta de autores usada pelos enriquecimentos.
func scanAuthors(rows pgx.Rows, out map[string]enrichedAuthor) error {
	for rows.Next() {
		var id string
		var author enrichedAuthor
		if err := rows.Scan(&id, &author.username, &author.displayName, &author.avatarURL); err != nil {
			return err
		}
		out[id] = author
	}
	return nil
}

// EnrichPrayerRequests preenche autor, answered, grupos e contagens de reação em lote.
// Exposto para os feeds mesclados (home/groups/mural), que fatiam a página no service
// e só então enriquecem os itens que serão de fato retornados.
//
// As consultas são independentes entre si e viajam num único pgx.Batch. O custo
// dominante aqui é a ida e volta até o Supabase, não a execução: agrupá-las
// transforma cinco viagens em uma, e sem consumir cinco conexões do pool, que
// tem teto de DB_MAX_CONNS para o processo inteiro.
func (r *PostgresRepository) EnrichPrayerRequests(ctx context.Context, userID string, items []*models.PrayerRequest) error {
	if len(items) == 0 {
		return nil
	}

	ids := make([]string, 0, len(items))
	indexByID := make(map[string]int, len(items))
	authorIDs := make([]string, 0, len(items))
	authorSet := make(map[string]struct{}, len(items))
	for i := range items {
		ids = append(ids, items[i].ID)
		indexByID[items[i].ID] = i
		items[i].PrayerTypeCounts = map[string]int64{}
		if _, ok := authorSet[items[i].AuthorID]; !ok {
			authorSet[items[i].AuthorID] = struct{}{}
			authorIDs = append(authorIDs, items[i].AuthorID)
		}
	}

	batch := &pgx.Batch{}
	batch.Queue(`
		SELECT id::text, username, display_name, avatar_url
		FROM users
		WHERE id = ANY($1::uuid[])
	`, authorIDs)
	batch.Queue(`
		SELECT id::text, answered_at, testimony
		FROM prayer_requests
		WHERE id = ANY($1::uuid[])
		  AND answered_at IS NOT NULL
	`, ids)
	batch.Queue(`
		SELECT prg.prayer_request_id::text, prg.group_id::text, g.name
		FROM prayer_request_groups prg
		INNER JOIN groups g ON g.id = prg.group_id
		WHERE prg.prayer_request_id = ANY($1::uuid[])
		  AND g.deleted_at IS NULL
	`, ids)
	batch.Queue(`
		SELECT prayer_request_id::text, action_type, COUNT(*)::bigint
		FROM prayer_actions
		WHERE prayer_request_id = ANY($1::uuid[])
		GROUP BY prayer_request_id, action_type
	`, ids)
	// Visitante anônimo não tem reações próprias para marcar.
	withViewer := userID != ""
	if withViewer {
		batch.Queue(`
			SELECT DISTINCT prayer_request_id::text, action_type
			FROM prayer_actions
			WHERE user_id = $1
			  AND prayer_request_id = ANY($2::uuid[])
		`, userID, ids)
	}

	br := r.db.SendBatch(ctx, batch)
	defer br.Close()

	authorByID := make(map[string]enrichedAuthor, len(authorIDs))
	if err := nextBatchRows(br, func(rows pgx.Rows) error {
		return scanAuthors(rows, authorByID)
	}); err != nil {
		return err
	}
	for i := range items {
		author, ok := authorByID[items[i].AuthorID]
		if !ok {
			continue
		}
		// Honor allow_anonymous: every viewer that isn't the author themselves
		// sees the request as authored by "Anônimo" — no username, no avatar.
		// AuthorID is kept (it's not exposed in any user-by-id route) so
		// downstream code can still tell who owns what when needed.
		if items[i].AllowAnonymous && items[i].AuthorID != userID {
			items[i].AuthorUsername = ""
			items[i].AuthorDisplayName = "Anônimo"
			items[i].AuthorAvatarURL = nil
			continue
		}
		items[i].AuthorUsername = author.username
		items[i].AuthorDisplayName = author.displayName
		items[i].AuthorAvatarURL = author.avatarURL
	}

	if err := nextBatchRows(br, func(rows pgx.Rows) error {
		for rows.Next() {
			var requestID string
			var answeredAt time.Time
			var testimony *string
			if err := rows.Scan(&requestID, &answeredAt, &testimony); err != nil {
				return err
			}
			if idx, ok := indexByID[requestID]; ok {
				at := answeredAt
				items[idx].AnsweredAt = &at
				items[idx].Testimony = testimony
			}
		}
		return nil
	}); err != nil {
		return err
	}

	if err := nextBatchRows(br, func(rows pgx.Rows) error {
		for rows.Next() {
			var requestID, groupID, groupName string
			if err := rows.Scan(&requestID, &groupID, &groupName); err != nil {
				return err
			}
			if idx, ok := indexByID[requestID]; ok {
				items[idx].GroupIDs = append(items[idx].GroupIDs, groupID)
				items[idx].GroupNames = append(items[idx].GroupNames, groupName)
			}
		}
		return nil
	}); err != nil {
		return err
	}

	if err := nextBatchRows(br, func(rows pgx.Rows) error {
		for rows.Next() {
			var requestID, actionType string
			var count int64
			if err := rows.Scan(&requestID, &actionType, &count); err != nil {
				return err
			}
			if idx, ok := indexByID[requestID]; ok {
				items[idx].PrayerTypeCounts[actionType] = count
			}
		}
		return nil
	}); err != nil {
		return err
	}

	if !withViewer {
		return nil
	}
	return nextBatchRows(br, func(rows pgx.Rows) error {
		for rows.Next() {
			var requestID, actionType string
			if err := rows.Scan(&requestID, &actionType); err != nil {
				return err
			}
			if idx, ok := indexByID[requestID]; ok {
				items[idx].MyPrayerTypes = append(items[idx].MyPrayerTypes, actionType)
			}
		}
		return nil
	})
}

func (r *PostgresRepository) SendFriendRequest(ctx context.Context, fromUserID, targetUsername string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var targetUserID string
	err = tx.QueryRow(ctx, `
		SELECT id::text
		FROM users
		WHERE LOWER(username) = LOWER($1) AND deleted_at IS NULL
	`, targetUsername).Scan(&targetUserID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrFriendUserNotFound
		}
		return err
	}
	if targetUserID == fromUserID {
		return ErrCannotAddSelf
	}

	var blockExists bool
	err = tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM user_blocks
			WHERE (blocker_user_id = $1 AND blocked_user_id = $2)
			   OR (blocker_user_id = $2 AND blocked_user_id = $1)
		)
	`, fromUserID, targetUserID).Scan(&blockExists)
	if err != nil {
		return err
	}
	if blockExists {
		return ErrUserBlocked
	}

	var existingStatus string
	err = tx.QueryRow(ctx, `
		SELECT status
		FROM friendships
		WHERE (user_id = $1 AND friend_user_id = $2)
		   OR (user_id = $2 AND friend_user_id = $1)
		LIMIT 1
	`, fromUserID, targetUserID).Scan(&existingStatus)
	if err == nil {
		return ErrFriendRequestAlreadyExists
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}

	var friendshipID string
	err = tx.QueryRow(ctx, `
		INSERT INTO friendships (user_id, friend_user_id, status)
		VALUES ($1, $2, 'PENDING')
		RETURNING id::text
	`, fromUserID, targetUserID).Scan(&friendshipID)
	if err != nil {
		return err
	}

	actor := fromUserID
	_ = insertNotificationInTx(ctx, tx, models.CreateNotificationInput{
		UserID:      targetUserID,
		Type:        models.NotificationTypeFriendRequestReceived,
		ActorUserID: &actor,
		SubjectType: models.NotificationSubjectFriendship,
		SubjectID:   friendshipID,
		Payload:     map[string]any{},
	})

	return tx.Commit(ctx)
}

// listFriendsSQL resolve, na mesma viagem, o que a página de amigos mostra de
// cada um: amigos e grupos em comum e a intenção mais recente que o viewer
// enxerga. A intenção passa pelo predicado canônico e ignora pedidos anônimos —
// mostrá-los aqui revelaria a autoria.
var listFriendsSQL = `
	WITH friend_pairs AS (
		SELECT
			CASE WHEN user_id = $1 THEN friend_user_id ELSE user_id END AS friend_id,
			updated_at
		FROM friendships
		WHERE status = 'ACCEPTED'
		  AND (user_id = $1 OR friend_user_id = $1)
	),
	friend_edges AS (
		SELECT user_id AS a, friend_user_id AS b FROM friendships WHERE status = 'ACCEPTED'
		UNION ALL
		SELECT friend_user_id, user_id FROM friendships WHERE status = 'ACCEPTED'
	),
	mutual AS (
		SELECT fe.a AS friend_id, COUNT(*)::int AS mf
		FROM friend_edges fe
		INNER JOIN friend_pairs mine ON mine.friend_id = fe.b
		WHERE fe.a IN (SELECT friend_id FROM friend_pairs)
		GROUP BY fe.a
	),
	shared AS (
		SELECT theirs.user_id AS friend_id, COUNT(DISTINCT theirs.group_id)::int AS sg
		FROM group_memberships theirs
		INNER JOIN group_memberships mine
		        ON mine.group_id = theirs.group_id
		       AND mine.user_id = $1
		       AND mine.deleted_at IS NULL
		INNER JOIN groups g ON g.id = theirs.group_id AND g.deleted_at IS NULL
		WHERE theirs.deleted_at IS NULL
		  AND theirs.user_id IN (SELECT friend_id FROM friend_pairs)
		GROUP BY theirs.user_id
	)
	SELECT u.id::text, u.username, u.display_name, u.avatar_url, u.bio, fp.updated_at,
	       COALESCE(m.mf, 0), COALESCE(s.sg, 0),
	       lr.id, lr.title, lr.created_at, lr.prayed_count
	FROM friend_pairs fp
	INNER JOIN users u ON u.id = fp.friend_id
	LEFT JOIN mutual m ON m.friend_id = u.id
	LEFT JOIN shared s ON s.friend_id = u.id
	LEFT JOIN LATERAL (
		SELECT pr.id::text AS id, pr.title, pr.created_at, pr.prayed_count
		FROM prayer_requests pr
		WHERE pr.author_id = u.id
		  AND pr.allow_anonymous = false
		  AND ` + prayerRequestVisibleTo("$1::uuid") + `
		ORDER BY pr.created_at DESC
		LIMIT 1
	) lr ON true
	WHERE u.deleted_at IS NULL
	ORDER BY fp.updated_at DESC
`

func (r *PostgresRepository) ListFriends(ctx context.Context, userID string) ([]models.Friend, error) {
	rows, err := r.db.Query(ctx, listFriendsSQL, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]models.Friend, 0)
	for rows.Next() {
		var item models.Friend
		var latestID, latestTitle *string
		var latestAt *time.Time
		var latestPrayed *int
		err = rows.Scan(
			&item.UserID, &item.Username, &item.DisplayName, &item.AvatarURL, &item.Bio, &item.ConnectedAt,
			&item.MutualFriends, &item.SharedGroups,
			&latestID, &latestTitle, &latestAt, &latestPrayed,
		)
		if err != nil {
			return nil, err
		}
		if latestID != nil && latestTitle != nil && latestAt != nil {
			item.LatestRequest = &models.FriendLatestRequest{ID: *latestID, Title: *latestTitle, CreatedAt: *latestAt}
			if latestPrayed != nil {
				item.LatestRequest.PrayedCount = *latestPrayed
			}
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *PostgresRepository) ListPendingFriendRequests(ctx context.Context, userID string) ([]models.FriendRequest, error) {
	rows, err := r.db.Query(ctx, `
		SELECT f.id::text, u.id::text, u.username, u.display_name, u.avatar_url, f.created_at
		FROM friendships f
		INNER JOIN users u ON u.id = f.user_id
		WHERE f.friend_user_id = $1
		  AND f.status = 'PENDING'
		  AND u.deleted_at IS NULL
		ORDER BY f.created_at ASC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]models.FriendRequest, 0)
	for rows.Next() {
		var item models.FriendRequest
		err = rows.Scan(&item.ID, &item.FromUserID, &item.Username, &item.DisplayName, &item.AvatarURL, &item.RequestedAt)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

// markFriendRequestNotificationReadSQL é concatenado nas CTEs de aceitar e
// recusar: resolver o pedido em qualquer tela (painel, /friends, mural) apaga o
// aviso correspondente do sino, na mesma viagem. Espera a CTE `fr(id)`.
const markFriendRequestNotificationReadSQL = `
	seen AS (
		UPDATE notifications
		SET read_at = NOW()
		WHERE user_id = $2
		  AND type = 'FRIEND_REQUEST_RECEIVED'
		  AND subject_id IN (SELECT id FROM fr)
		  AND read_at IS NULL
	)
`

func (r *PostgresRepository) AcceptFriendRequest(ctx context.Context, userID, requestID string) error {
	var senderID string
	err := r.db.QueryRow(ctx, `
		WITH fr AS (
			UPDATE friendships
			SET status = 'ACCEPTED', updated_at = NOW()
			WHERE id = $1
			  AND friend_user_id = $2
			  AND status = 'PENDING'
			RETURNING id, user_id
		),
		`+markFriendRequestNotificationReadSQL+`
		SELECT user_id::text FROM fr
	`, requestID, userID).Scan(&senderID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrFriendRequestNotFound
		}
		return err
	}

	actor := userID
	_ = insertNotificationOn(ctx, r.db, models.CreateNotificationInput{
		UserID:      senderID,
		Type:        models.NotificationTypeFriendRequestAccepted,
		ActorUserID: &actor,
		SubjectType: models.NotificationSubjectFriendship,
		SubjectID:   requestID,
		Payload:     map[string]any{},
	})
	return nil
}

func (r *PostgresRepository) RejectFriendRequest(ctx context.Context, userID, requestID string) error {
	var deleted int
	err := r.db.QueryRow(ctx, `
		WITH fr AS (
			DELETE FROM friendships
			WHERE id = $1
			  AND friend_user_id = $2
			  AND status = 'PENDING'
			RETURNING id
		),
		`+markFriendRequestNotificationReadSQL+`
		SELECT COUNT(*)::int FROM fr
	`, requestID, userID).Scan(&deleted)
	if err != nil {
		return err
	}
	if deleted == 0 {
		return ErrFriendRequestNotFound
	}
	return nil
}

func (r *PostgresRepository) CancelFriendRequest(ctx context.Context, userID, requestID string) error {
	tag, err := r.db.Exec(ctx, `
		DELETE FROM friendships
		WHERE id = $1
		  AND user_id = $2
		  AND status = 'PENDING'
	`, requestID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrFriendRequestNotFound
	}
	return nil
}

func (r *PostgresRepository) RemoveFriendship(ctx context.Context, userID, targetUserID string) error {
	tag, err := r.db.Exec(ctx, `
		DELETE FROM friendships
		WHERE status = 'ACCEPTED'
		  AND (
		    (user_id = $1 AND friend_user_id = $2)
		    OR (user_id = $2 AND friend_user_id = $1)
		  )
	`, userID, targetUserID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrFriendshipNotFound
	}
	return nil
}

func (r *PostgresRepository) SearchUsersForFriendship(ctx context.Context, userID, query string, limit int) ([]models.UserSummary, error) {
	if limit <= 0 || limit > 30 {
		limit = 20
	}
	// Um pedido de amizade e uma amizade aceita são a mesma linha de
	// friendships, distintas só pelo status. Filtrar por existência de linha
	// escondia da busca justamente quem o usuário acabou de adicionar, então o
	// vínculo vira um estado devolvido no payload em vez de um filtro.
	rows, err := r.db.Query(ctx, `
		SELECT u.id::text, u.username, u.display_name, u.avatar_url,
		       COALESCE((
			       SELECT CASE
					WHEN f.status = 'ACCEPTED' THEN 'FRIEND'
					WHEN f.status = 'PENDING' AND f.user_id = $1 THEN 'PENDING_OUT'
					WHEN f.status = 'PENDING' THEN 'PENDING_IN'
					ELSE 'NONE'
				      END
			       FROM friendships f
			       WHERE (f.user_id = $1 AND f.friend_user_id = u.id)
			          OR (f.user_id = u.id AND f.friend_user_id = $1)
			       LIMIT 1
		       ), 'NONE') AS friendship_status
		FROM users u
		WHERE u.id <> $1
		  AND u.deleted_at IS NULL
		  AND (
			  u.username ILIKE $2 || '%'
			  OR u.display_name ILIKE '%' || $2 || '%'
		  )
		  AND NOT EXISTS (
			  SELECT 1
			  FROM friendships f
			  WHERE ((f.user_id = $1 AND f.friend_user_id = u.id)
			      OR (f.user_id = u.id AND f.friend_user_id = $1))
			    AND f.status = 'BLOCKED'
		  )
		  AND NOT EXISTS (
			  SELECT 1 FROM user_blocks ub
			  WHERE (ub.blocker_user_id = $1 AND ub.blocked_user_id = u.id)
			     OR (ub.blocked_user_id = $1 AND ub.blocker_user_id = u.id)
		  )
		ORDER BY u.display_name ASC
		LIMIT $3
	`, userID, query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]models.UserSummary, 0)
	for rows.Next() {
		var item models.UserSummary
		var friendshipStatus string
		err = rows.Scan(&item.UserID, &item.Username, &item.DisplayName, &item.AvatarURL, &friendshipStatus)
		if err != nil {
			return nil, err
		}
		item.FriendshipStatus = models.PublicFriendshipState(friendshipStatus)
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *PostgresRepository) GetGroupDetails(ctx context.Context, viewerUserID, groupID string) (models.GroupDetails, error) {
	var d models.GroupDetails
	var myRole *string
	var hasPending bool
	err := r.db.QueryRow(ctx, `
		SELECT
			g.id::text, g.name, g.description, g.image_url, g.join_policy, g.requires_moderation,
			g.created_by::text, g.created_at, g.updated_at,
			(SELECT COUNT(*)::bigint FROM group_memberships gm WHERE gm.group_id = g.id AND gm.deleted_at IS NULL) AS member_count,
			(SELECT gm.role::text FROM group_memberships gm
				WHERE gm.group_id = g.id AND gm.user_id = NULLIF($2, '')::uuid AND gm.deleted_at IS NULL) AS my_role,
			EXISTS (
				SELECT 1 FROM group_join_requests gjr
				WHERE gjr.group_id = g.id AND gjr.user_id = NULLIF($2, '')::uuid AND gjr.status = 'PENDING'
			) AS has_pending
		FROM groups g
		WHERE g.id = $1 AND g.deleted_at IS NULL
	`, groupID, viewerUserID).Scan(
		&d.ID, &d.Name, &d.Description, &d.ImageURL, &d.JoinPolicy, &d.RequiresModeration,
		&d.CreatedBy, &d.CreatedAt, &d.UpdatedAt,
		&d.MemberCount, &myRole, &hasPending,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.GroupDetails{}, ErrGroupNotFound
		}
		return models.GroupDetails{}, err
	}
	if myRole != nil {
		role := models.GroupRole(*myRole)
		d.MyRole = &role
		d.IsMember = true
	}
	d.HasPendingJoin = hasPending
	return d, nil
}

// GetGroupRoleOf devolve o papel do usuário no grupo. Parte de groups, e não
// de group_memberships, para distinguir na mesma viagem "grupo não existe"
// (ErrGroupNotFound) de "não é membro" (isMember false): sem isso, toda ação
// num grupo inexistente virava 403 em vez de 404.
func (r *PostgresRepository) GetGroupRoleOf(ctx context.Context, userID, groupID string) (models.GroupRole, bool, error) {
	var role *string
	err := r.db.QueryRow(ctx, `
		SELECT gm.role::text
		FROM groups g
		LEFT JOIN group_memberships gm
			ON gm.group_id = g.id AND gm.user_id = $2::uuid AND gm.deleted_at IS NULL
		WHERE g.id = $1::uuid AND g.deleted_at IS NULL
	`, groupID, userID).Scan(&role)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", false, ErrGroupNotFound
		}
		return "", false, err
	}
	if role == nil {
		return "", false, nil
	}
	return models.GroupRole(*role), true, nil
}

func (r *PostgresRepository) CountGroupAdmins(ctx context.Context, groupID string) (int64, error) {
	var n int64
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)::bigint FROM group_memberships
		WHERE group_id = $1 AND role = 'ADMIN' AND deleted_at IS NULL
	`, groupID).Scan(&n)
	return n, err
}

func (r *PostgresRepository) ListGroupMembers(ctx context.Context, groupID string, limit, offset int) ([]models.GroupMember, int64, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	var total int64
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)::bigint FROM group_memberships
		WHERE group_id = $1 AND deleted_at IS NULL
	`, groupID).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	rows, err := r.db.Query(ctx, `
		SELECT u.id::text, u.username, u.display_name, u.avatar_url, gm.role::text, gm.created_at
		FROM group_memberships gm
		INNER JOIN users u ON u.id = gm.user_id
		WHERE gm.group_id = $1 AND gm.deleted_at IS NULL AND u.deleted_at IS NULL
		ORDER BY
			CASE gm.role WHEN 'ADMIN' THEN 0 WHEN 'MODERATOR' THEN 1 ELSE 2 END,
			gm.created_at ASC
		LIMIT $2 OFFSET $3
	`, groupID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	items := make([]models.GroupMember, 0)
	for rows.Next() {
		var m models.GroupMember
		var role string
		if err = rows.Scan(&m.UserID, &m.Username, &m.DisplayName, &m.AvatarURL, &role, &m.JoinedAt); err != nil {
			return nil, 0, err
		}
		m.Role = models.GroupRole(role)
		items = append(items, m)
	}
	return items, total, rows.Err()
}

func (r *PostgresRepository) ChangeMemberRole(ctx context.Context, groupID, targetUserID string, newRole models.GroupRole) error {
	ct, err := r.db.Exec(ctx, `
		UPDATE group_memberships
		SET role = $3, updated_at = NOW()
		WHERE group_id = $1 AND user_id = $2 AND deleted_at IS NULL
	`, groupID, targetUserID, newRole)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrGroupMembershipNotFound
	}
	return nil
}

func (r *PostgresRepository) RemoveMember(ctx context.Context, groupID, targetUserID string) error {
	ct, err := r.db.Exec(ctx, `
		UPDATE group_memberships
		SET deleted_at = NOW(), updated_at = NOW()
		WHERE group_id = $1 AND user_id = $2 AND deleted_at IS NULL
	`, groupID, targetUserID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrGroupMembershipNotFound
	}
	return nil
}

func (r *PostgresRepository) UpdateGroup(ctx context.Context, groupID string, in models.UpdateGroupInput) (models.Group, error) {
	var g models.Group
	err := r.db.QueryRow(ctx, `
		UPDATE groups
		SET
			name = COALESCE($2, name),
			description = COALESCE($3, description),
			image_url = CASE WHEN $4::text IS NULL THEN image_url ELSE NULLIF($4, '') END,
			join_policy = COALESCE($5::group_join_policy, join_policy),
			updated_at = NOW()
		WHERE id = $1 AND deleted_at IS NULL
		RETURNING id::text, name, description, image_url, join_policy, requires_moderation, created_by::text, created_at, updated_at
	`,
		groupID,
		in.Name,
		in.Description,
		nullableStringPtr(in.ImageURL),
		nullableJoinPolicyPtr(in.JoinPolicy),
	).Scan(&g.ID, &g.Name, &g.Description, &g.ImageURL, &g.JoinPolicy, &g.RequiresModeration, &g.CreatedBy, &g.CreatedAt, &g.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.Group{}, ErrGroupNotFound
		}
		return models.Group{}, err
	}
	return g, nil
}

func nullableStringPtr(p *string) any {
	if p == nil {
		return nil
	}
	return *p
}

func nullableJoinPolicyPtr(p *models.GroupJoinPolicy) any {
	if p == nil {
		return nil
	}
	return string(*p)
}

func (r *PostgresRepository) ListPrayerRequestsByGroup(ctx context.Context, viewerUserID, groupID string, limit, offset int) ([]models.PrayerRequest, error) {
	rows, err := r.db.Query(ctx, `
		SELECT pr.id::text, pr.author_id::text, pr.title, pr.body, pr.category, pr.visibility, pr.tradition, pr.allow_anonymous, pr.status, pr.prayed_count, pr.created_at, pr.updated_at
		FROM prayer_requests pr
		INNER JOIN prayer_request_groups prg ON prg.prayer_request_id = pr.id
		WHERE prg.group_id = $1
		  AND pr.status = 'ACTIVE'
		  AND pr.deleted_at IS NULL
		  AND pr.tradition = COALESCE(
			(SELECT tradition FROM users WHERE id = NULLIF($4, '')::uuid AND deleted_at IS NULL),
			pr.tradition
		  )
		ORDER BY pr.created_at DESC
		LIMIT $2 OFFSET $3
	`, groupID, limit, offset, viewerUserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	// Sem enrich aqui: o mural do grupo (service.ListGroupFeed) fatia a página
	// antes e enriquece só os itens retornados via EnrichPrayerRequests.
	return scanPrayerRequests(rows)
}

func (r *PostgresRepository) CountPrayerRequestsByGroup(ctx context.Context, viewerUserID, groupID string) (int64, error) {
	var total int64
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)::bigint
		FROM prayer_requests pr
		INNER JOIN prayer_request_groups prg ON prg.prayer_request_id = pr.id
		WHERE prg.group_id = $1
		  AND pr.status = 'ACTIVE'
		  AND pr.deleted_at IS NULL
		  AND pr.tradition = COALESCE(
			(SELECT tradition FROM users WHERE id = NULLIF($2, '')::uuid AND deleted_at IS NULL),
			pr.tradition
		  )
	`, groupID, viewerUserID).Scan(&total)
	return total, err
}

type notifyExec interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

func insertNotificationOn(ctx context.Context, exec notifyExec, in models.CreateNotificationInput) error {
	payload := in.Payload
	if payload == nil {
		payload = map[string]any{}
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		log.Printf("notification insert failed: payload marshal type=%s user=%s err=%v", in.Type, in.UserID, err)
		return err
	}
	_, err = exec.Exec(ctx, `
		INSERT INTO notifications (user_id, type, actor_user_id, subject_type, subject_id, payload)
		VALUES ($1::uuid, $2, NULLIF($3, '')::uuid, $4, $5::uuid, $6::jsonb)
	`, in.UserID, string(in.Type), nullableStringValue(in.ActorUserID), string(in.SubjectType), in.SubjectID, string(payloadBytes))
	if err != nil {
		log.Printf("notification insert failed: type=%s user=%s subject_type=%s subject_id=%s err=%v", in.Type, in.UserID, in.SubjectType, in.SubjectID, err)
	}
	return err
}

// insertNotificationInTx inserts a notification inside a SAVEPOINT so a failure
// (FK violation, type mismatch, etc.) doesn't poison the outer transaction.
// Notifications are best-effort: callers ignore the error.
func insertNotificationInTx(ctx context.Context, tx pgx.Tx, in models.CreateNotificationInput) error {
	sub, err := tx.Begin(ctx)
	if err != nil {
		log.Printf("notification insert failed: in_tx savepoint begin type=%s user=%s err=%v", in.Type, in.UserID, err)
		return err
	}
	if err := insertNotificationOn(ctx, sub, in); err != nil {
		_ = sub.Rollback(ctx)
		return err
	}
	if err := sub.Commit(ctx); err != nil {
		log.Printf("notification insert failed: in_tx savepoint commit type=%s user=%s err=%v", in.Type, in.UserID, err)
		return err
	}
	return nil
}

func nullableStringValue(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func (r *PostgresRepository) CreateNotification(ctx context.Context, in models.CreateNotificationInput) error {
	return insertNotificationOn(ctx, r.db, in)
}

// ListNotifications devolve a página e os contadores do shell num único batch:
// a página de notificações precisa dos dois, e em série seriam duas viagens.
func (r *PostgresRepository) ListNotifications(ctx context.Context, userID string, limit, offset int) ([]models.NotificationView, models.NotificationSummary, error) {
	if limit <= 0 {
		limit = 20
	} else if limit > 50 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}
	var summary models.NotificationSummary
	batch := &pgx.Batch{}
	batch.Queue(`
		SELECT n.id::text, n.type, n.subject_type, n.subject_id::text, n.payload, n.read_at, n.created_at,
		       a.id::text, a.username, a.display_name, a.avatar_url,
		       f.status
		FROM notifications n
		LEFT JOIN users a ON a.id = n.actor_user_id AND a.deleted_at IS NULL
		-- Estado atual do pedido de amizade, para o front decidir entre mostrar
		-- Aceitar/Recusar ou o desfecho. Recusado/cancelado apaga a linha: NULL.
		LEFT JOIN friendships f
		       ON n.type = 'FRIEND_REQUEST_RECEIVED'
		      AND f.id = n.subject_id
		      AND f.friend_user_id = n.user_id
		WHERE n.user_id = $1
		ORDER BY n.created_at DESC
		LIMIT $2 OFFSET $3
	`, userID, limit, offset)
	batch.Queue(notificationSummarySQL, userID)

	br := r.db.SendBatch(ctx, batch)
	defer br.Close()

	items := make([]models.NotificationView, 0)
	err := nextBatchRows(br, func(rows pgx.Rows) error {
		for rows.Next() {
			var (
				n              models.NotificationView
				payloadBytes   []byte
				actorID        *string
				actorUsername  *string
				actorDisplay   *string
				actorAvatarURL *string
				friendStatus   *string
			)
			if err := rows.Scan(&n.ID, &n.Type, &n.SubjectType, &n.SubjectID, &payloadBytes, &n.ReadAt, &n.CreatedAt,
				&actorID, &actorUsername, &actorDisplay, &actorAvatarURL, &friendStatus); err != nil {
				return err
			}
			if n.Type == models.NotificationTypeFriendRequestReceived {
				n.FriendRequestStatus = models.FriendRequestStatusGone
				if friendStatus != nil {
					n.FriendRequestStatus = *friendStatus
				}
			}
			if len(payloadBytes) > 0 {
				if err := json.Unmarshal(payloadBytes, &n.Payload); err != nil {
					return err
				}
			}
			if n.Payload == nil {
				n.Payload = map[string]any{}
			}
			if actorID != nil {
				n.Actor = &models.NotificationActor{
					UserID:      *actorID,
					Username:    derefStr(actorUsername),
					DisplayName: derefStr(actorDisplay),
					AvatarURL:   actorAvatarURL,
				}
			}
			items = append(items, n)
		}
		return nil
	})
	if err != nil {
		return nil, summary, err
	}
	err = nextBatchRows(br, func(rows pgx.Rows) error {
		if rows.Next() {
			return rows.Scan(&summary.Count, &summary.FriendRequests)
		}
		return nil
	})
	return items, summary, err
}

func derefStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// notificationSummarySQL alimenta os contadores do shell (sino e "Amigos").
// Os dois totais saem no mesmo statement porque o shell faz polling a cada 30 s:
// uma viagem a mais aqui é paga em toda tela aberta.
const notificationSummarySQL = `
	SELECT
		(SELECT COUNT(*)::bigint
		   FROM notifications
		  WHERE user_id = $1 AND read_at IS NULL),
		(SELECT COUNT(*)::bigint
		   FROM friendships f
		   INNER JOIN users u ON u.id = f.user_id AND u.deleted_at IS NULL
		  WHERE f.friend_user_id = $1 AND f.status = 'PENDING')
`

func (r *PostgresRepository) GetNotificationSummary(ctx context.Context, userID string) (models.NotificationSummary, error) {
	var s models.NotificationSummary
	err := r.db.QueryRow(ctx, notificationSummarySQL, userID).Scan(&s.Count, &s.FriendRequests)
	return s, err
}

func (r *PostgresRepository) MarkNotificationRead(ctx context.Context, userID, id string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE notifications
		SET read_at = NOW()
		WHERE id = $1 AND user_id = $2 AND read_at IS NULL
	`, id, userID)
	return err
}

func (r *PostgresRepository) notifyGroupAdminsOfJoinRequest(ctx context.Context, requesterUserID, groupID string) {
	rows, err := r.db.Query(ctx, `
		SELECT user_id::text
		FROM group_memberships
		WHERE group_id = $1 AND role = 'ADMIN' AND deleted_at IS NULL
	`, groupID)
	if err != nil {
		return
	}
	defer rows.Close()

	actor := requesterUserID
	for rows.Next() {
		var adminID string
		if err := rows.Scan(&adminID); err != nil {
			return
		}
		if adminID == requesterUserID {
			continue
		}
		_ = insertNotificationOn(ctx, r.db, models.CreateNotificationInput{
			UserID:      adminID,
			Type:        models.NotificationTypeGroupJoinRequested,
			ActorUserID: &actor,
			SubjectType: models.NotificationSubjectGroup,
			SubjectID:   groupID,
			Payload:     map[string]any{},
		})
	}
}

func (r *PostgresRepository) MarkAllNotificationsRead(ctx context.Context, userID string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE notifications
		SET read_at = NOW()
		WHERE user_id = $1 AND read_at IS NULL
	`, userID)
	return err
}

func (r *PostgresRepository) BlockUser(ctx context.Context, blockerID, blockedUsername string) (models.BlockedUser, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return models.BlockedUser{}, err
	}
	defer tx.Rollback(ctx)

	var blockedID string
	var displayName, username string
	var avatarURL *string
	err = tx.QueryRow(ctx, `
		SELECT id::text, username, display_name, avatar_url
		FROM users
		WHERE LOWER(username) = LOWER($1) AND deleted_at IS NULL
	`, blockedUsername).Scan(&blockedID, &username, &displayName, &avatarURL)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.BlockedUser{}, ErrUserNotFound
		}
		return models.BlockedUser{}, err
	}
	if blockedID == blockerID {
		return models.BlockedUser{}, ErrCannotAddSelf
	}

	var blockedAt time.Time
	err = tx.QueryRow(ctx, `
		INSERT INTO user_blocks (blocker_user_id, blocked_user_id)
		VALUES ($1, $2)
		ON CONFLICT (blocker_user_id, blocked_user_id) DO NOTHING
		RETURNING created_at
	`, blockerID, blockedID).Scan(&blockedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return models.BlockedUser{}, ErrAlreadyBlocked
		}
		return models.BlockedUser{}, err
	}

	// Tear down friendship/pending requests both directions.
	_, err = tx.Exec(ctx, `
		DELETE FROM friendships
		WHERE (user_id = $1 AND friend_user_id = $2)
		   OR (user_id = $2 AND friend_user_id = $1)
	`, blockerID, blockedID)
	if err != nil {
		return models.BlockedUser{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return models.BlockedUser{}, err
	}

	return models.BlockedUser{
		UserID:      blockedID,
		Username:    username,
		DisplayName: displayName,
		AvatarURL:   avatarURL,
		BlockedAt:   blockedAt,
	}, nil
}

func (r *PostgresRepository) UnblockUser(ctx context.Context, blockerID, blockedUserID string) error {
	tag, err := r.db.Exec(ctx, `
		DELETE FROM user_blocks
		WHERE blocker_user_id = $1 AND blocked_user_id = $2
	`, blockerID, blockedUserID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrBlockNotFound
	}
	return nil
}

func (r *PostgresRepository) ListBlockedUsers(ctx context.Context, blockerID string) ([]models.BlockedUser, error) {
	rows, err := r.db.Query(ctx, `
		SELECT u.id::text, u.username, u.display_name, u.avatar_url, b.created_at
		FROM user_blocks b
		INNER JOIN users u ON u.id = b.blocked_user_id
		WHERE b.blocker_user_id = $1 AND u.deleted_at IS NULL
		ORDER BY b.created_at DESC
	`, blockerID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]models.BlockedUser, 0)
	for rows.Next() {
		var item models.BlockedUser
		if err := rows.Scan(&item.UserID, &item.Username, &item.DisplayName, &item.AvatarURL, &item.BlockedAt); err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *PostgresRepository) IsBlockedEitherWay(ctx context.Context, viewerID, otherID string) (bool, error) {
	dir, err := r.BlockDirection(ctx, viewerID, otherID)
	return dir != "NONE", err
}

func (r *PostgresRepository) BlockDirection(ctx context.Context, viewerID, otherID string) (string, error) {
	if viewerID == "" || otherID == "" || viewerID == otherID {
		return "NONE", nil
	}
	var byMe, byThem bool
	err := r.db.QueryRow(ctx, `
		SELECT
			EXISTS (SELECT 1 FROM user_blocks WHERE blocker_user_id = $1 AND blocked_user_id = $2),
			EXISTS (SELECT 1 FROM user_blocks WHERE blocker_user_id = $2 AND blocked_user_id = $1)
	`, viewerID, otherID).Scan(&byMe, &byThem)
	if err != nil {
		return "NONE", err
	}
	if byMe {
		return "BY_ME", nil
	}
	if byThem {
		return "BY_THEM", nil
	}
	return "NONE", nil
}

func (r *PostgresRepository) ListModerationQueue(ctx context.Context, moderatorUserID string, limit, offset int) ([]models.ModerationQueueItem, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := r.db.Query(ctx, `
		SELECT DISTINCT
			pr.id::text,
			g.id::text AS group_id,
			g.name AS group_name,
			u.id::text AS author_id,
			u.username,
			u.display_name,
			u.avatar_url,
			pr.title,
			pr.body,
			pr.category,
			pr.visibility,
			pr.created_at
		FROM prayer_requests pr
		INNER JOIN prayer_request_groups prg ON prg.prayer_request_id = pr.id
		INNER JOIN groups g ON g.id = prg.group_id AND g.deleted_at IS NULL
		INNER JOIN group_memberships gm
		    ON gm.group_id = g.id
		   AND gm.user_id = $1
		   AND gm.deleted_at IS NULL
		   AND gm.role IN ('ADMIN','MODERATOR')
		INNER JOIN users u ON u.id = pr.author_id AND u.deleted_at IS NULL
		WHERE pr.status = 'PENDING_REVIEW'
		  AND pr.deleted_at IS NULL
		ORDER BY pr.created_at ASC
		LIMIT $2 OFFSET $3
	`, moderatorUserID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]models.ModerationQueueItem, 0)
	for rows.Next() {
		var it models.ModerationQueueItem
		if err := rows.Scan(
			&it.ID, &it.GroupID, &it.GroupName,
			&it.AuthorID, &it.AuthorUsername, &it.AuthorDisplayName, &it.AuthorAvatarURL,
			&it.Title, &it.Body, &it.Category, &it.Visibility, &it.CreatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, it)
	}
	return items, rows.Err()
}

func (r *PostgresRepository) ApplyModerationAction(ctx context.Context, moderatorUserID, requestID string, action models.ModerationActionType, reason string) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var (
		authorID  string
		status    string
		groupID   *string
		groupName *string
	)
	err = tx.QueryRow(ctx, `
		SELECT
			pr.author_id::text,
			pr.status,
			(SELECT g.id::text FROM groups g
				INNER JOIN prayer_request_groups prg ON prg.group_id = g.id
				WHERE prg.prayer_request_id = pr.id
				LIMIT 1) AS group_id,
			(SELECT g.name FROM groups g
				INNER JOIN prayer_request_groups prg ON prg.group_id = g.id
				WHERE prg.prayer_request_id = pr.id
				LIMIT 1) AS group_name
		FROM prayer_requests pr
		WHERE pr.id = $1 AND pr.deleted_at IS NULL
	`, requestID).Scan(&authorID, &status, &groupID, &groupName)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrPrayerRequestNotFound
		}
		return err
	}

	if groupID == nil {
		return ErrModerationNotApplicable
	}

	var canModerate bool
	err = tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM group_memberships
			WHERE group_id = $1
			  AND user_id = $2
			  AND deleted_at IS NULL
			  AND role IN ('ADMIN','MODERATOR')
		)
	`, *groupID, moderatorUserID).Scan(&canModerate)
	if err != nil {
		return err
	}
	if !canModerate {
		return ErrPrayerRequestForbidden
	}

	var newStatus string
	var notifType models.NotificationType
	switch action {
	case models.ActionApprove:
		if status != "PENDING_REVIEW" {
			return ErrModerationNotApplicable
		}
		newStatus = "ACTIVE"
		notifType = models.NotificationTypeRequestApproved
	case models.ActionReject:
		newStatus = "REMOVED"
		notifType = models.NotificationTypeRequestRejected
	case models.ActionRequestChanges:
		if status != "PENDING_REVIEW" {
			return ErrModerationNotApplicable
		}
		newStatus = "ARCHIVED"
		notifType = models.NotificationTypeRequestChangesAsked
	case models.ActionRemove:
		newStatus = "REMOVED"
		notifType = models.NotificationTypeRequestRejected
	default:
		return ErrModerationNotApplicable
	}

	_, err = tx.Exec(ctx, `
		UPDATE prayer_requests
		SET status = $2, updated_at = NOW()
		WHERE id = $1
	`, requestID, newStatus)
	if err != nil {
		return err
	}

	var reasonPtr any
	if strings.TrimSpace(reason) == "" {
		reasonPtr = nil
	} else {
		reasonPtr = strings.TrimSpace(reason)
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO moderation_actions (prayer_request_id, group_id, actor_user_id, action, reason)
		VALUES ($1, $2, $3, $4, $5)
	`, requestID, *groupID, moderatorUserID, string(action), reasonPtr)
	if err != nil {
		return err
	}

	if authorID != moderatorUserID {
		actor := moderatorUserID
		payload := map[string]any{}
		if groupName != nil {
			payload["groupName"] = *groupName
		}
		if reasonPtr != nil {
			payload["reason"] = reasonPtr
		}
		_ = insertNotificationInTx(ctx, tx, models.CreateNotificationInput{
			UserID:      authorID,
			Type:        notifType,
			ActorUserID: &actor,
			SubjectType: models.NotificationSubjectPrayerRequest,
			SubjectID:   requestID,
			Payload:     payload,
		})
	}

	return tx.Commit(ctx)
}

// ListModerationHistory devolve o histórico de moderação de um pedido. Só o
// autor e os moderadores/admins de um grupo do pedido podem ler: o motivo de
// uma rejeição é informação interna do grupo.
//
// A checagem de acesso e a leitura do histórico viajam no mesmo batch. O
// histórico é descartado quando o acesso é negado.
func (r *PostgresRepository) ListModerationHistory(ctx context.Context, viewerUserID, requestID string) ([]models.ModerationActionRecord, error) {
	batch := &pgx.Batch{}
	batch.Queue(`
		SELECT pr.author_id = $2::uuid OR EXISTS (
			SELECT 1
			FROM prayer_request_groups prg
			INNER JOIN group_memberships gm
				ON gm.group_id = prg.group_id
				AND gm.user_id = $2::uuid
				AND gm.deleted_at IS NULL
				AND gm.role IN ('ADMIN', 'MODERATOR')
			WHERE prg.prayer_request_id = pr.id
		)
		FROM prayer_requests pr
		WHERE pr.id = $1::uuid AND pr.deleted_at IS NULL
	`, requestID, viewerUserID)
	batch.Queue(`
		SELECT id::text, prayer_request_id::text, group_id::text, actor_user_id::text, action, reason, created_at
		FROM moderation_actions
		WHERE prayer_request_id = $1
		ORDER BY created_at DESC
	`, requestID)

	br := r.db.SendBatch(ctx, batch)
	defer br.Close()

	var allowed bool
	if err := br.QueryRow().Scan(&allowed); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrPrayerRequestNotFound
		}
		return nil, err
	}
	if !allowed {
		return nil, ErrPrayerRequestForbidden
	}

	items := make([]models.ModerationActionRecord, 0)
	if err := nextBatchRows(br, func(rows pgx.Rows) error {
		for rows.Next() {
			var it models.ModerationActionRecord
			if err := rows.Scan(&it.ID, &it.PrayerRequestID, &it.GroupID, &it.ActorUserID, &it.Action, &it.Reason, &it.CreatedAt); err != nil {
				return err
			}
			items = append(items, it)
		}
		return nil
	}); err != nil {
		return nil, err
	}
	return items, nil
}

// announcementSelectClause returns the columns + joins shared by every
// announcement read query so SELECT shape stays consistent with scanAnnouncementRow.
const announcementSelectClause = `
	SELECT a.id::text, a.group_id::text, g.name, a.author_id::text,
	       u.username, u.display_name, u.avatar_url,
	       a.title, a.body, a.event_at, a.image_url,
	       a.created_at, a.updated_at
	FROM group_announcements a
	INNER JOIN groups g ON g.id = a.group_id
	INNER JOIN users u ON u.id = a.author_id
`

func scanAnnouncementRow(row pgx.Row) (models.GroupAnnouncement, error) {
	var a models.GroupAnnouncement
	err := row.Scan(
		&a.ID, &a.GroupID, &a.GroupName, &a.AuthorID,
		&a.AuthorUsername, &a.AuthorDisplayName, &a.AuthorAvatarURL,
		&a.Title, &a.Body, &a.EventAt, &a.ImageURL,
		&a.CreatedAt, &a.UpdatedAt,
	)
	return a, err
}

func scanAnnouncementRows(rows pgx.Rows) ([]models.GroupAnnouncement, error) {
	items := make([]models.GroupAnnouncement, 0)
	for rows.Next() {
		var a models.GroupAnnouncement
		if err := rows.Scan(
			&a.ID, &a.GroupID, &a.GroupName, &a.AuthorID,
			&a.AuthorUsername, &a.AuthorDisplayName, &a.AuthorAvatarURL,
			&a.Title, &a.Body, &a.EventAt, &a.ImageURL,
			&a.CreatedAt, &a.UpdatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, a)
	}
	return items, rows.Err()
}

func (r *PostgresRepository) CreateAnnouncement(ctx context.Context, in models.CreateAnnouncementInput) (models.GroupAnnouncement, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return models.GroupAnnouncement{}, err
	}
	defer tx.Rollback(ctx)

	var id string
	if err := tx.QueryRow(ctx, `
		INSERT INTO group_announcements (group_id, author_id, title, body, event_at, image_url)
		VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6)
		RETURNING id::text
	`, in.GroupID, in.AuthorID, in.Title, in.Body, in.EventAt, in.ImageURL).Scan(&id); err != nil {
		return models.GroupAnnouncement{}, err
	}

	r.notifyGroupMembersOfAnnouncement(ctx, tx, in.GroupID, id, in.AuthorID, in.Title)

	if err := tx.Commit(ctx); err != nil {
		return models.GroupAnnouncement{}, err
	}

	return r.GetAnnouncementByID(ctx, id)
}

func (r *PostgresRepository) GetAnnouncementByID(ctx context.Context, announcementID string) (models.GroupAnnouncement, error) {
	row := r.db.QueryRow(ctx, announcementSelectClause+`
		WHERE a.id = $1::uuid AND a.deleted_at IS NULL
	`, announcementID)
	a, err := scanAnnouncementRow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return models.GroupAnnouncement{}, ErrAnnouncementNotFound
	}
	return a, err
}

func (r *PostgresRepository) ListAnnouncementsByGroup(ctx context.Context, groupID string, limit, offset int) ([]models.GroupAnnouncement, error) {
	rows, err := r.db.Query(ctx, announcementSelectClause+`
		WHERE a.group_id = $1::uuid AND a.deleted_at IS NULL
		ORDER BY a.created_at DESC
		LIMIT $2 OFFSET $3
	`, groupID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanAnnouncementRows(rows)
}

func (r *PostgresRepository) CountAnnouncementsByGroup(ctx context.Context, groupID string) (int64, error) {
	var n int64
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)::bigint
		FROM group_announcements
		WHERE group_id = $1::uuid AND deleted_at IS NULL
	`, groupID).Scan(&n)
	return n, err
}

func (r *PostgresRepository) ListAnnouncementsForUser(ctx context.Context, userID string, limit, offset int) ([]models.GroupAnnouncement, error) {
	rows, err := r.db.Query(ctx, announcementSelectClause+`
		INNER JOIN group_memberships gm ON gm.group_id = a.group_id
		WHERE gm.user_id = $1::uuid AND gm.deleted_at IS NULL AND a.deleted_at IS NULL
		ORDER BY a.created_at DESC
		LIMIT $2 OFFSET $3
	`, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanAnnouncementRows(rows)
}

func (r *PostgresRepository) CountAnnouncementsForUser(ctx context.Context, userID string) (int64, error) {
	var n int64
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)::bigint
		FROM group_announcements a
		INNER JOIN group_memberships gm ON gm.group_id = a.group_id
		WHERE gm.user_id = $1::uuid AND gm.deleted_at IS NULL AND a.deleted_at IS NULL
	`, userID).Scan(&n)
	return n, err
}

func (r *PostgresRepository) UpdateAnnouncement(ctx context.Context, announcementID string, in models.UpdateAnnouncementInput) (models.GroupAnnouncement, error) {
	sets := make([]string, 0, 5)
	args := make([]any, 0, 6)
	pos := 1
	if in.Title != nil {
		sets = append(sets, "title = $"+itoa(pos))
		args = append(args, *in.Title)
		pos++
	}
	if in.Body != nil {
		sets = append(sets, "body = $"+itoa(pos))
		args = append(args, *in.Body)
		pos++
	}
	if in.EventAt != nil {
		sets = append(sets, "event_at = $"+itoa(pos))
		args = append(args, *in.EventAt)
		pos++
	}
	if in.ImageURL != nil {
		// Empty string clears the image; non-empty sets it.
		if *in.ImageURL == "" {
			sets = append(sets, "image_url = NULL")
		} else {
			sets = append(sets, "image_url = $"+itoa(pos))
			args = append(args, *in.ImageURL)
			pos++
		}
	}
	if len(sets) == 0 {
		return r.GetAnnouncementByID(ctx, announcementID)
	}
	sets = append(sets, "updated_at = NOW()")
	query := "UPDATE group_announcements SET " + strings.Join(sets, ", ") + " WHERE id = $" + itoa(pos) + "::uuid AND deleted_at IS NULL"
	args = append(args, announcementID)
	tag, err := r.db.Exec(ctx, query, args...)
	if err != nil {
		return models.GroupAnnouncement{}, err
	}
	if tag.RowsAffected() == 0 {
		return models.GroupAnnouncement{}, ErrAnnouncementNotFound
	}
	return r.GetAnnouncementByID(ctx, announcementID)
}

func (r *PostgresRepository) SoftDeleteAnnouncement(ctx context.Context, announcementID string) error {
	tag, err := r.db.Exec(ctx, `
		UPDATE group_announcements
		SET deleted_at = NOW(), updated_at = NOW()
		WHERE id = $1::uuid AND deleted_at IS NULL
	`, announcementID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrAnnouncementNotFound
	}
	return nil
}

func (r *PostgresRepository) notifyGroupMembersOfAnnouncement(ctx context.Context, exec notifyExec, groupID, announcementID, authorID, title string) {
	// Best-effort: failure to notify must not fail the announcement create.
	// Fan-out em um único INSERT ... SELECT em vez de 1 INSERT por membro.
	payloadBytes, err := json.Marshal(map[string]any{
		"announcementId": announcementID,
		"title":          title,
	})
	if err != nil {
		log.Printf("notification insert failed: payload marshal type=%s group=%s err=%v", models.NotificationTypeGroupAnnouncementPosted, groupID, err)
		return
	}
	_, err = exec.Exec(ctx, `
		INSERT INTO notifications (user_id, type, actor_user_id, subject_type, subject_id, payload)
		SELECT gm.user_id, $3, $2::uuid, $4, $1::uuid, $5::jsonb
		FROM group_memberships gm
		WHERE gm.group_id = $1::uuid AND gm.deleted_at IS NULL AND gm.user_id <> $2::uuid
	`, groupID, authorID, string(models.NotificationTypeGroupAnnouncementPosted), string(models.NotificationSubjectGroup), string(payloadBytes))
	if err != nil {
		log.Printf("notification insert failed: announcement fan-out group=%s announcement=%s err=%v", groupID, announcementID, err)
	}
}

// itoa is a tiny helper to build $N placeholders without importing strconv at every call site.
func itoa(n int) string {
	if n < 10 {
		return string(rune('0' + n))
	}
	// supports up to $99 which is more than enough for any builder here
	return string(rune('0'+n/10)) + string(rune('0'+n%10))
}

// SuggestFriends returns up to `limit` users ranked by mutual friends + shared
// groups, excluding self, existing friends/incoming/outgoing requests, and
// users involved in any blocking relationship with the viewer.
func (r *PostgresRepository) SuggestFriends(ctx context.Context, userID string, limit int) ([]models.UserSuggestion, error) {
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	rows, err := r.db.Query(ctx, `
		WITH viewer_friends AS (
			SELECT CASE WHEN user_id = $1 THEN friend_user_id ELSE user_id END AS uid
			FROM friendships
			WHERE status = 'ACCEPTED' AND (user_id = $1 OR friend_user_id = $1)
		),
		viewer_groups AS (
			SELECT group_id FROM group_memberships
			WHERE user_id = $1 AND deleted_at IS NULL
		),
		excluded AS (
			SELECT $1::uuid AS uid
			UNION SELECT uid FROM viewer_friends
			UNION SELECT friend_user_id FROM friendships WHERE user_id = $1 AND status = 'PENDING'
			UNION SELECT user_id FROM friendships WHERE friend_user_id = $1 AND status = 'PENDING'
			UNION SELECT blocked_user_id FROM user_blocks WHERE blocker_user_id = $1
			UNION SELECT blocker_user_id FROM user_blocks WHERE blocked_user_id = $1
		),
		mutual AS (
			SELECT CASE WHEN f.user_id = vf.uid THEN f.friend_user_id ELSE f.user_id END AS candidate,
			       COUNT(*)::int AS mf
			FROM friendships f
			INNER JOIN viewer_friends vf ON vf.uid IN (f.user_id, f.friend_user_id)
			WHERE f.status = 'ACCEPTED'
			GROUP BY 1
		),
		shared AS (
			SELECT gm.user_id AS candidate, COUNT(DISTINCT gm.group_id)::int AS sg
			FROM group_memberships gm
			INNER JOIN viewer_groups vg ON vg.group_id = gm.group_id
			WHERE gm.deleted_at IS NULL
			GROUP BY gm.user_id
		),
		ranked AS (
			SELECT u.id::text, u.username, u.display_name, u.avatar_url,
			       COALESCE(m.mf, 0) AS mf,
			       COALESCE(s.sg, 0) AS sg
			FROM users u
			LEFT JOIN mutual m ON m.candidate = u.id
			LEFT JOIN shared s ON s.candidate = u.id
			WHERE u.deleted_at IS NULL
			  AND u.id NOT IN (SELECT uid FROM excluded WHERE uid IS NOT NULL)
			  AND (COALESCE(m.mf, 0) + COALESCE(s.sg, 0)) > 0
		)
		SELECT id, username, display_name, avatar_url, mf, sg
		FROM ranked
		ORDER BY (mf + sg) DESC, mf DESC, username ASC
		LIMIT $2
	`, userID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]models.UserSuggestion, 0)
	for rows.Next() {
		var s models.UserSuggestion
		if err := rows.Scan(&s.UserID, &s.Username, &s.DisplayName, &s.AvatarURL, &s.MutualFriends, &s.SharedGroups); err != nil {
			return nil, err
		}
		switch {
		case s.MutualFriends > 0 && s.SharedGroups > 0:
			s.Reason = "Amigos em comum e grupos juntos"
		case s.MutualFriends > 0:
			if s.MutualFriends == 1 {
				s.Reason = "1 amigo em comum"
			} else {
				s.Reason = formatMutualReason(s.MutualFriends)
			}
		case s.SharedGroups > 0:
			if s.SharedGroups == 1 {
				s.Reason = "1 grupo em comum"
			} else {
				s.Reason = formatGroupReason(s.SharedGroups)
			}
		}
		items = append(items, s)
	}
	return items, rows.Err()
}

func formatMutualReason(n int) string {
	return strings.Replace("N amigos em comum", "N", strconvI(n), 1)
}

func formatGroupReason(n int) string {
	return strings.Replace("N grupos em comum", "N", strconvI(n), 1)
}

func strconvI(n int) string {
	// avoid pulling strconv just for this
	if n < 10 {
		return string(rune('0' + n))
	}
	return string(rune('0'+n/10)) + string(rune('0'+n%10))
}

// ListMyPrayers returns the authenticated user's own prayer actions joined with
// each request's title and author, newest first. Used by the "Rezadas (privado)"
// tab in the profile.
func (r *PostgresRepository) ListMyPrayers(ctx context.Context, userID string, limit, offset int) ([]models.MyPrayerEntry, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := r.db.Query(ctx, `
		SELECT pa.prayer_request_id::text, pr.title,
		       pr.author_id::text, u.username, u.display_name,
		       pa.action_type, pa.created_at
		FROM prayer_actions pa
		INNER JOIN prayer_requests pr ON pr.id = pa.prayer_request_id AND pr.deleted_at IS NULL
		INNER JOIN users u ON u.id = pr.author_id AND u.deleted_at IS NULL
		WHERE pa.user_id = $1::uuid
		ORDER BY pa.created_at DESC
		LIMIT $2 OFFSET $3
	`, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]models.MyPrayerEntry, 0)
	for rows.Next() {
		var e models.MyPrayerEntry
		if err := rows.Scan(&e.RequestID, &e.RequestTitle, &e.AuthorID, &e.AuthorUsername, &e.AuthorDisplayName, &e.ActionType, &e.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, e)
	}
	return items, rows.Err()
}

// ListPrayerActionsByRequest lista quem rezou num pedido visível ao viewer.
// Visibilidade e lista viajam no mesmo batch, sem ler o pedido inteiro nem
// enriquecê-lo só para decidir acesso.
func (r *PostgresRepository) ListPrayerActionsByRequest(ctx context.Context, viewerUserID, requestID string) ([]models.PrayerActionRecord, error) {
	batch := &pgx.Batch{}
	batch.Queue(prayerRequestAccessSQL, requestID, viewerUserID)
	batch.Queue(prayerRequestActionsSQL, requestID)

	br := r.db.SendBatch(ctx, batch)
	defer br.Close()

	var access models.PrayerRequestAccess
	if err := br.QueryRow().Scan(&access.AuthorID, &access.AllowAnonymous); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrPrayerRequestNotFound
		}
		return nil, err
	}
	var items []models.PrayerActionRecord
	err := nextBatchRows(br, func(rows pgx.Rows) (err error) {
		items, err = scanPrayerActionRecords(rows)
		return
	})
	return items, err
}

func (r *PostgresRepository) CreatePrayerRequestUpdate(ctx context.Context, requestID, authorID, body string) (models.PrayerRequestUpdate, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return models.PrayerRequestUpdate{}, err
	}
	defer tx.Rollback(ctx)

	var id string
	var createdAt time.Time
	if err := tx.QueryRow(ctx, `
		INSERT INTO prayer_request_updates (prayer_request_id, author_id, body)
		VALUES ($1::uuid, $2::uuid, $3)
		RETURNING id::text, created_at
	`, requestID, authorID, body).Scan(&id, &createdAt); err != nil {
		return models.PrayerRequestUpdate{}, err
	}

	r.notifyPrayersOfRequestUpdate(ctx, tx, requestID, authorID)

	if err := tx.Commit(ctx); err != nil {
		return models.PrayerRequestUpdate{}, err
	}

	out := models.PrayerRequestUpdate{
		ID:              id,
		PrayerRequestID: requestID,
		AuthorID:        authorID,
		Body:            body,
		CreatedAt:       createdAt,
	}
	// hydrate author info
	_ = r.db.QueryRow(ctx, `
		SELECT username, display_name FROM users WHERE id = $1::uuid AND deleted_at IS NULL
	`, authorID).Scan(&out.AuthorUsername, &out.AuthorDisplayName)
	return out, nil
}

// ListPrayerRequestUpdates lista as atualizações de um pedido visível ao
// viewer e devolve junto o acesso, que o service usa para aplicar o anonimato.
// Um batch, uma viagem.
func (r *PostgresRepository) ListPrayerRequestUpdates(ctx context.Context, viewerUserID, requestID string) ([]models.PrayerRequestUpdate, models.PrayerRequestAccess, error) {
	batch := &pgx.Batch{}
	batch.Queue(prayerRequestAccessSQL, requestID, viewerUserID)
	batch.Queue(`
		SELECT pru.id::text, pru.prayer_request_id::text, pru.author_id::text,
		       u.username, u.display_name,
		       pru.body, pru.created_at
		FROM prayer_request_updates pru
		INNER JOIN users u ON u.id = pru.author_id AND u.deleted_at IS NULL
		WHERE pru.prayer_request_id = $1::uuid
		ORDER BY pru.created_at DESC
	`, requestID)

	br := r.db.SendBatch(ctx, batch)
	defer br.Close()

	var access models.PrayerRequestAccess
	if err := br.QueryRow().Scan(&access.AuthorID, &access.AllowAnonymous); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, access, ErrPrayerRequestNotFound
		}
		return nil, access, err
	}
	items := make([]models.PrayerRequestUpdate, 0)
	err := nextBatchRows(br, func(rows pgx.Rows) error {
		for rows.Next() {
			var u models.PrayerRequestUpdate
			if err := rows.Scan(
				&u.ID, &u.PrayerRequestID, &u.AuthorID,
				&u.AuthorUsername, &u.AuthorDisplayName,
				&u.Body, &u.CreatedAt,
			); err != nil {
				return err
			}
			items = append(items, u)
		}
		return nil
	})
	return items, access, err
}

// notifyPrayersOfRequestUpdate emits a REQUEST_UPDATED notification for every
// distinct user who has prayed for the request, except the author. Best-effort.
func (r *PostgresRepository) notifyPrayersOfRequestUpdate(ctx context.Context, exec notifyExec, requestID, authorID string) {
	r.notifyPrayersOfRequest(ctx, exec, requestID, authorID, models.NotificationTypeRequestUpdated)
}

// notifyPrayersOfRequestAnswered emits a REQUEST_ANSWERED notification for every
// distinct user who has prayed for the request, except the author. Best-effort.
func (r *PostgresRepository) notifyPrayersOfRequestAnswered(ctx context.Context, exec notifyExec, requestID, authorID string) {
	r.notifyPrayersOfRequest(ctx, exec, requestID, authorID, models.NotificationTypeRequestAnswered)
}

// notifyPrayersOfRequest fans out a PRAYER_REQUEST-scoped notification of the
// given type to every distinct user who prayed for the request, except the
// author. Best-effort.
func (r *PostgresRepository) notifyPrayersOfRequest(ctx context.Context, exec notifyExec, requestID, authorID string, notifType models.NotificationType) {
	rows, err := r.db.Query(ctx, `
		SELECT DISTINCT user_id::text
		FROM prayer_actions
		WHERE prayer_request_id = $1::uuid AND user_id <> $2::uuid
	`, requestID, authorID)
	if err != nil {
		return
	}
	prayerIDs := make([]string, 0)
	for rows.Next() {
		var pid string
		if err := rows.Scan(&pid); err != nil {
			rows.Close()
			return
		}
		prayerIDs = append(prayerIDs, pid)
	}
	rows.Close()

	actor := authorID
	for _, pid := range prayerIDs {
		_ = insertNotificationOn(ctx, exec, models.CreateNotificationInput{
			UserID:      pid,
			Type:        notifType,
			ActorUserID: &actor,
			SubjectType: models.NotificationSubjectPrayerRequest,
			SubjectID:   requestID,
			Payload:     map[string]any{},
		})
	}
}

var _ Repository = (*PostgresRepository)(nil)
var _ = pgx.ErrNoRows

// ---------------------------------------------------------------------------
// Versículo do dia e compartilhamentos
// ---------------------------------------------------------------------------

// verseShareColumns é a projeção compartilhada por toda listagem de
// compartilhamento. Todas as queries selecionam estas colunas nesta ordem, que
// é o que scanVerseShares espera — mesmo contrato de scanPrayerRequests.
const verseShareColumns = `
	vs.id::text, vs.author_id::text, vs.comment, vs.visibility, vs.tradition,
	vs.created_at, vs.updated_at,
	bv.id::text, bv.book_slug, bv.book_name, bv.chapter, bv.verse, bv.theme,
	bv.tradition, bv.translation, COALESCE(bv.text, '')
`

// verseShareFrom é o FROM comum: o versículo sempre vem junto (o card do feed
// não faz sentido sem ele) e o autor precisa estar ativo.
const verseShareFrom = `
	FROM verse_shares vs
	INNER JOIN bible_verses bv ON bv.id = vs.verse_id
	INNER JOIN users u ON u.id = vs.author_id AND u.deleted_at IS NULL
`

// bibleVerseColumns projeta o catálogo sozinho, sem compartilhamento.
const bibleVerseColumns = `
	id::text, book_slug, book_name, chapter, verse, theme, tradition,
	translation, COALESCE(text, '')
`

func scanBibleVerse(row pgx.Row) (models.BibleVerse, error) {
	var v models.BibleVerse
	err := row.Scan(&v.ID, &v.BookSlug, &v.BookName, &v.Chapter, &v.Verse,
		&v.Theme, &v.Tradition, &v.Translation, &v.Text)
	if err != nil {
		return models.BibleVerse{}, err
	}
	v.FillReference()
	return v, nil
}

func scanVerseShares(rows pgx.Rows) ([]models.VerseShare, error) {
	items := make([]models.VerseShare, 0)
	for rows.Next() {
		var vs models.VerseShare
		err := rows.Scan(
			&vs.ID, &vs.AuthorID, &vs.Comment, &vs.Visibility, &vs.Tradition,
			&vs.CreatedAt, &vs.UpdatedAt,
			&vs.Verse.ID, &vs.Verse.BookSlug, &vs.Verse.BookName, &vs.Verse.Chapter,
			&vs.Verse.Verse, &vs.Verse.Theme, &vs.Verse.Tradition,
			&vs.Verse.Translation, &vs.Verse.Text,
		)
		if err != nil {
			return nil, err
		}
		vs.Verse.FillReference()
		items = append(items, vs)
	}
	return items, rows.Err()
}

// CountVersePool conta o catálogo visível para uma tradição. Versículos com
// tradition NULL servem as duas.
func (r *PostgresRepository) CountVersePool(ctx context.Context, tradition models.Tradition) (int64, error) {
	var total int64
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)::bigint
		FROM bible_verses
		WHERE deleted_at IS NULL
		  AND (tradition IS NULL OR tradition = $1)
	`, tradition).Scan(&total)
	return total, err
}

// GetVerseByPoolOffset devolve o versículo na posição offset do pool daquela
// tradição. O ORDER BY id dá a ordem estável de que a escolha determinística do
// versículo do dia depende: mudar essa ordenação muda o versículo de todo mundo.
func (r *PostgresRepository) GetVerseByPoolOffset(ctx context.Context, tradition models.Tradition, offset int64) (models.BibleVerse, error) {
	verse, err := scanBibleVerse(r.db.QueryRow(ctx, `
		SELECT `+bibleVerseColumns+`
		FROM bible_verses
		WHERE deleted_at IS NULL
		  AND (tradition IS NULL OR tradition = $1)
		ORDER BY id
		OFFSET $2
		LIMIT 1
	`, tradition, offset))
	if errors.Is(err, pgx.ErrNoRows) {
		return models.BibleVerse{}, ErrVerseNotFound
	}
	return verse, err
}

// GetVerseByID busca uma entrada do catálogo pelo id.
func (r *PostgresRepository) GetVerseByID(ctx context.Context, verseID string) (models.BibleVerse, error) {
	verse, err := scanBibleVerse(r.db.QueryRow(ctx, `
		SELECT `+bibleVerseColumns+`
		FROM bible_verses
		WHERE id = $1 AND deleted_at IS NULL
	`, verseID))
	if errors.Is(err, pgx.ErrNoRows) {
		return models.BibleVerse{}, ErrVerseNotFound
	}
	return verse, err
}

// SetVerseText persiste o texto hidratado da API, para que a próxima leitura
// não precise mais da rede.
func (r *PostgresRepository) SetVerseText(ctx context.Context, verseID, text string) error {
	_, err := r.db.Exec(ctx, `
		UPDATE bible_verses
		SET text = $2, fetched_at = NOW(), updated_at = NOW()
		WHERE id = $1
	`, verseID, text)
	return err
}

// HasSharedVerseOn diz se o usuário já compartilhou aquele versículo no dia
// informado (YYYY-MM-DD, no fuso de São Paulo — o mesmo que define o "dia" do
// versículo). Compartilhamentos apagados não contam.
func (r *PostgresRepository) HasSharedVerseOn(ctx context.Context, userID, verseID, day string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM verse_shares
			WHERE author_id = $1::uuid
			  AND verse_id = $2::uuid
			  AND deleted_at IS NULL
			  AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date = $3::date
		)
	`, userID, verseID, day).Scan(&exists)
	return exists, err
}

// CreateVerseShare grava o compartilhamento e seus grupos alvo numa transação,
// espelhando CreatePrayerRequest: a tradição é um snapshot do autor e cada
// grupo alvo exige membresia ativa.
func (r *PostgresRepository) CreateVerseShare(ctx context.Context, in models.CreateVerseShareInput) (models.VerseShare, error) {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return models.VerseShare{}, err
	}
	defer tx.Rollback(ctx)

	var shareID string
	err = tx.QueryRow(ctx, `
		INSERT INTO verse_shares (author_id, verse_id, comment, visibility, tradition)
		VALUES ($1::uuid, $2::uuid, $3, $4, COALESCE((SELECT tradition FROM users WHERE id = $1::uuid), 'CATHOLIC'))
		RETURNING id::text
	`, in.AuthorID, in.VerseID, in.Comment, in.Visibility).Scan(&shareID)
	if err != nil {
		return models.VerseShare{}, err
	}

	for _, groupID := range in.GroupIDs {
		var canPost bool
		err = tx.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM group_memberships gm
				WHERE gm.group_id = $1::uuid
				  AND gm.user_id = $2::uuid
				  AND gm.deleted_at IS NULL
			)
		`, groupID, in.AuthorID).Scan(&canPost)
		if err != nil {
			return models.VerseShare{}, err
		}
		if !canPost {
			return models.VerseShare{}, ErrGroupAccessDenied
		}

		if _, err = tx.Exec(ctx, `
			INSERT INTO verse_share_groups (verse_share_id, group_id)
			VALUES ($1::uuid, $2::uuid)
		`, shareID, groupID); err != nil {
			return models.VerseShare{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return models.VerseShare{}, err
	}
	return r.GetVerseShareByID(ctx, in.AuthorID, shareID)
}

// verseShareVisibleTo é o predicado canônico de visibilidade de um
// compartilhamento (alias vs), no mesmo espírito de prayerRequestVisibleTo:
//
//   - o autor vê o que é seu, inclusive PRIVATE e depois de trocar de tradição;
//   - os demais precisam ser da mesma tradição, não ter bloqueio com o autor em
//     nenhuma direção e cair numa das regras: PUBLIC é aberto, FRIENDS exige
//     amizade aceita e GROUP_ONLY exige membresia num dos grupos alvo.
//
// viewer é a expressão SQL do id do viewer; NULL representa visitante anônimo,
// que só enxerga PUBLIC.
func verseShareVisibleTo(viewer string) string {
	return strings.ReplaceAll(`
		vs.deleted_at IS NULL
		AND (
			vs.author_id = :viewer
			OR (
				vs.tradition = COALESCE(
					(SELECT tradition FROM users WHERE id = :viewer AND deleted_at IS NULL),
					vs.tradition
				)
				AND (
					vs.visibility = 'PUBLIC'
					OR (vs.visibility = 'FRIENDS' AND EXISTS (
						SELECT 1 FROM friendships f
						WHERE f.status = 'ACCEPTED'
						  AND ((f.user_id = vs.author_id AND f.friend_user_id = :viewer)
						    OR (f.friend_user_id = vs.author_id AND f.user_id = :viewer))
					))
					OR (vs.visibility = 'GROUP_ONLY' AND EXISTS (
						SELECT 1 FROM verse_share_groups vsg
						INNER JOIN group_memberships gm ON gm.group_id = vsg.group_id
						WHERE vsg.verse_share_id = vs.id
						  AND gm.user_id = :viewer
						  AND gm.deleted_at IS NULL
					))
				)
				AND NOT EXISTS (
					SELECT 1 FROM user_blocks ub
					WHERE (ub.blocker_user_id = :viewer AND ub.blocked_user_id = vs.author_id)
					   OR (ub.blocked_user_id = :viewer AND ub.blocker_user_id = vs.author_id)
				)
			)
		)`, ":viewer", viewer)
}

// verseShareTargetFrom restringe o compartilhamento a autores ativos, como o
// FROM do feed faz.
const verseShareTargetFrom = `
	FROM verse_shares vs
	INNER JOIN users author ON author.id = vs.author_id AND author.deleted_at IS NULL
`

var getVerseShareByIDSQL = `SELECT ` + verseShareColumns + verseShareFrom + `
	WHERE vs.id = $1::uuid AND ` + verseShareVisibleTo("NULLIF($2, '')::uuid")

var verseShareVisibleSQL = `SELECT 1` + verseShareTargetFrom + `
	WHERE vs.id = $1::uuid AND ` + verseShareVisibleTo("$2::uuid")

// GetVerseShareByID devolve um compartilhamento visível ao viewer.
// viewerUserID vazio representa visitante anônimo.
func (r *PostgresRepository) GetVerseShareByID(ctx context.Context, viewerUserID, shareID string) (models.VerseShare, error) {
	rows, err := r.db.Query(ctx, getVerseShareByIDSQL, shareID, viewerUserID)
	if err != nil {
		return models.VerseShare{}, err
	}
	defer rows.Close()

	items, err := scanVerseShares(rows)
	if err != nil {
		return models.VerseShare{}, err
	}
	if len(items) == 0 {
		return models.VerseShare{}, ErrVerseShareNotFound
	}
	if err := r.enrichVerseShares(ctx, viewerUserID, items); err != nil {
		return models.VerseShare{}, err
	}
	return items[0], nil
}

// DeleteVerseShare faz soft delete; só o autor pode apagar.
func (r *PostgresRepository) DeleteVerseShare(ctx context.Context, userID, shareID string) error {
	ct, err := r.db.Exec(ctx, `
		UPDATE verse_shares
		SET deleted_at = NOW(), updated_at = NOW()
		WHERE id = $1::uuid AND author_id = $2::uuid AND deleted_at IS NULL
	`, shareID, userID)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrVerseShareNotFound
	}
	return nil
}

// verseShares não têm contador desnormalizado: PrayedCount é somado no enrich
// a partir das próprias reações, então a reação não tem afterInsert.
var recordVerseShareActionSQL = reactionSQL(
	`SELECT vs.id, vs.author_id`+verseShareTargetFrom+`WHERE vs.id = $2::uuid AND `+verseShareVisibleTo("$1::uuid"),
	"verse_share_id",
	"",
)

// RecordVerseShareAction registra uma reação num compartilhamento visível ao
// usuário, com as mesmas regras e o mesmo custo de RecordPrayerAction.
func (r *PostgresRepository) RecordVerseShareAction(ctx context.Context, in models.ReactionInput) error {
	return r.recordReaction(ctx, recordVerseShareActionSQL, in, ErrVerseShareNotFound,
		models.NotificationTypeVerseSharePrayed, models.NotificationSubjectVerseShare)
}

// prayerActionRecordsSQL lista as reações de um alvo; column é a coluna de
// prayer_actions que aponta para ele.
func prayerActionRecordsSQL(column string) string {
	return `
		SELECT pa.user_id::text, u.username, u.display_name, u.avatar_url, pa.action_type, pa.created_at
		FROM prayer_actions pa
		INNER JOIN users u ON u.id = pa.user_id AND u.deleted_at IS NULL
		WHERE pa.` + column + ` = $1::uuid
		ORDER BY pa.created_at DESC
	`
}

var (
	prayerRequestActionsSQL = prayerActionRecordsSQL("prayer_request_id")
	verseShareActionsSQL    = prayerActionRecordsSQL("verse_share_id")
)

func scanPrayerActionRecords(rows pgx.Rows) ([]models.PrayerActionRecord, error) {
	items := make([]models.PrayerActionRecord, 0)
	for rows.Next() {
		var rec models.PrayerActionRecord
		if err := rows.Scan(&rec.UserID, &rec.Username, &rec.DisplayName, &rec.AvatarURL, &rec.ActionType, &rec.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, rec)
	}
	return items, nil
}

// ListVerseShareActions lista quem rezou num compartilhamento visível ao
// viewer. A checagem de visibilidade e a lista viajam no mesmo batch; a lista é
// descartada quando o compartilhamento não é visível.
func (r *PostgresRepository) ListVerseShareActions(ctx context.Context, viewerUserID, shareID string) ([]models.PrayerActionRecord, error) {
	batch := &pgx.Batch{}
	batch.Queue(verseShareVisibleSQL, shareID, viewerUserID)
	batch.Queue(verseShareActionsSQL, shareID)

	br := r.db.SendBatch(ctx, batch)
	defer br.Close()

	var one int
	if err := br.QueryRow().Scan(&one); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrVerseShareNotFound
		}
		return nil, err
	}
	var items []models.PrayerActionRecord
	err := nextBatchRows(br, func(rows pgx.Rows) (err error) {
		items, err = scanPrayerActionRecords(rows)
		return
	})
	return items, err
}

func (r *PostgresRepository) enrichVerseShares(ctx context.Context, viewerUserID string, items []models.VerseShare) error {
	refs := make([]*models.VerseShare, len(items))
	for i := range items {
		refs[i] = &items[i]
	}
	return r.EnrichVerseShares(ctx, viewerUserID, refs)
}

// EnrichVerseShares preenche autor, grupos e contagens de reação em lote,
// espelhando EnrichPrayerRequests. Recebe ponteiros para que os feeds mesclados
// possam enriquecer a página final no lugar.
//
// As consultas são independentes e viajam num único pgx.Batch, pela mesma razão
// de EnrichPrayerRequests: o custo é ida e volta, não execução.
//
// Não há tratamento de anonimato aqui: compartilhar um versículo é sempre
// identificado, ao contrário de um pedido de oração.
func (r *PostgresRepository) EnrichVerseShares(ctx context.Context, viewerUserID string, items []*models.VerseShare) error {
	if len(items) == 0 {
		return nil
	}

	ids := make([]string, 0, len(items))
	indexByID := make(map[string]int, len(items))
	authorIDs := make([]string, 0, len(items))
	authorSet := make(map[string]struct{}, len(items))
	for i, item := range items {
		ids = append(ids, item.ID)
		indexByID[item.ID] = i
		if _, seen := authorSet[item.AuthorID]; !seen {
			authorSet[item.AuthorID] = struct{}{}
			authorIDs = append(authorIDs, item.AuthorID)
		}
	}

	batch := &pgx.Batch{}
	batch.Queue(`
		SELECT id::text, username, display_name, avatar_url
		FROM users
		WHERE id = ANY($1::uuid[])
	`, authorIDs)
	batch.Queue(`
		SELECT vsg.verse_share_id::text, vsg.group_id::text, g.name
		FROM verse_share_groups vsg
		INNER JOIN groups g ON g.id = vsg.group_id
		WHERE vsg.verse_share_id = ANY($1::uuid[])
		  AND g.deleted_at IS NULL
	`, ids)
	batch.Queue(`
		SELECT verse_share_id::text, action_type, COUNT(*)::bigint
		FROM prayer_actions
		WHERE verse_share_id = ANY($1::uuid[])
		GROUP BY verse_share_id, action_type
	`, ids)
	withViewer := viewerUserID != ""
	if withViewer {
		batch.Queue(`
			SELECT DISTINCT verse_share_id::text, action_type
			FROM prayer_actions
			WHERE user_id = $1::uuid AND verse_share_id = ANY($2::uuid[])
		`, viewerUserID, ids)
	}

	br := r.db.SendBatch(ctx, batch)
	defer br.Close()

	authors := make(map[string]enrichedAuthor, len(authorIDs))
	if err := nextBatchRows(br, func(rows pgx.Rows) error {
		return scanAuthors(rows, authors)
	}); err != nil {
		return err
	}
	for i := range items {
		if info, ok := authors[items[i].AuthorID]; ok {
			items[i].AuthorUsername = info.username
			items[i].AuthorDisplayName = info.displayName
			items[i].AuthorAvatarURL = info.avatarURL
		}
	}

	if err := nextBatchRows(br, func(rows pgx.Rows) error {
		for rows.Next() {
			var shareID, groupID, groupName string
			if err := rows.Scan(&shareID, &groupID, &groupName); err != nil {
				return err
			}
			if idx, ok := indexByID[shareID]; ok {
				items[idx].GroupIDs = append(items[idx].GroupIDs, groupID)
				items[idx].GroupNames = append(items[idx].GroupNames, groupName)
			}
		}
		return nil
	}); err != nil {
		return err
	}

	// Esta é a única consulta que toca PrayedCount: o total é somado daqui, e
	// não de um contador desnormalizado que pudesse dessincronizar.
	if err := nextBatchRows(br, func(rows pgx.Rows) error {
		for rows.Next() {
			var shareID, actionType string
			var count int64
			if err := rows.Scan(&shareID, &actionType, &count); err != nil {
				return err
			}
			if idx, ok := indexByID[shareID]; ok {
				if items[idx].PrayerTypeCounts == nil {
					items[idx].PrayerTypeCounts = make(map[string]int64, 4)
				}
				items[idx].PrayerTypeCounts[actionType] = count
				items[idx].PrayedCount += count
			}
		}
		return nil
	}); err != nil {
		return err
	}

	if !withViewer {
		return nil
	}
	return nextBatchRows(br, func(rows pgx.Rows) error {
		for rows.Next() {
			var shareID, actionType string
			if err := rows.Scan(&shareID, &actionType); err != nil {
				return err
			}
			if idx, ok := indexByID[shareID]; ok {
				items[idx].MyPrayerTypes = append(items[idx].MyPrayerTypes, actionType)
			}
		}
		return nil
	})
}

// verseViewerCTEs são as CTEs comuns aos feeds autenticados, com a mesma forma
// usada por ListHomePrayerRequests: a tradição do viewer, seus amigos aceitos e
// os bloqueios nas duas direções. $1 é sempre o id do viewer.
const verseViewerCTEs = `
	viewer AS (
		SELECT tradition FROM users WHERE id = $1::uuid AND deleted_at IS NULL
	),
	friend_ids AS (
		SELECT CASE WHEN user_id = $1::uuid THEN friend_user_id ELSE user_id END AS friend_id
		FROM friendships
		WHERE status = 'ACCEPTED' AND (user_id = $1::uuid OR friend_user_id = $1::uuid)
	),
	blocked_ids AS (
		SELECT blocked_user_id AS uid FROM user_blocks WHERE blocker_user_id = $1::uuid
		UNION
		SELECT blocker_user_id AS uid FROM user_blocks WHERE blocked_user_id = $1::uuid
	)
`

// Cada constante abaixo seleciona os ids visíveis num stream. Todas preservam
// os mesmos invariantes: deleted_at IS NULL, filtro de tradição (exceto no ramo
// do próprio autor, que sempre vê o que é seu), exclusão mútua por user_blocks,
// e PRIVATE restrito ao autor.
const (
	verseIDsHome = `
		SELECT vs.id
		FROM verse_shares vs
		WHERE vs.author_id = $1::uuid AND vs.deleted_at IS NULL
		UNION
		SELECT vs.id
		FROM verse_shares vs
		INNER JOIN friend_ids f ON f.friend_id = vs.author_id
		WHERE vs.visibility IN ('PUBLIC', 'FRIENDS')
		  AND vs.deleted_at IS NULL
		  AND vs.tradition = (SELECT tradition FROM viewer)
		  AND vs.author_id NOT IN (SELECT uid FROM blocked_ids)
		UNION
		SELECT vs.id
		FROM verse_shares vs
		INNER JOIN verse_share_groups vsg ON vsg.verse_share_id = vs.id
		INNER JOIN group_memberships gm ON gm.group_id = vsg.group_id
		WHERE gm.user_id = $1::uuid
		  AND gm.deleted_at IS NULL
		  AND vs.visibility = 'GROUP_ONLY'
		  AND vs.deleted_at IS NULL
		  AND vs.tradition = (SELECT tradition FROM viewer)
		  AND vs.author_id NOT IN (SELECT uid FROM blocked_ids)
	`

	verseIDsFriends = `
		SELECT vs.id
		FROM verse_shares vs
		INNER JOIN friend_ids f ON f.friend_id = vs.author_id
		WHERE vs.visibility IN ('PUBLIC', 'FRIENDS')
		  AND vs.deleted_at IS NULL
		  AND vs.tradition = (SELECT tradition FROM viewer)
		  AND vs.author_id NOT IN (SELECT uid FROM blocked_ids)
	`

	verseIDsGroups = `
		SELECT vs.id
		FROM verse_shares vs
		INNER JOIN verse_share_groups vsg ON vsg.verse_share_id = vs.id
		INNER JOIN group_memberships gm ON gm.group_id = vsg.group_id
		WHERE gm.user_id = $1::uuid
		  AND gm.deleted_at IS NULL
		  AND vs.visibility = 'GROUP_ONLY'
		  AND vs.deleted_at IS NULL
		  AND vs.tradition = (SELECT tradition FROM viewer)
		  AND vs.author_id NOT IN (SELECT uid FROM blocked_ids)
	`

	// $2 é o grupo. O acesso à membresia é validado antes, no service, por
	// ensureGroupFeedAccess — aqui só se filtra o conteúdo.
	verseIDsByGroup = `
		SELECT vs.id
		FROM verse_shares vs
		INNER JOIN verse_share_groups vsg ON vsg.verse_share_id = vs.id
		WHERE vsg.group_id = $2::uuid
		  AND vs.visibility = 'GROUP_ONLY'
		  AND vs.deleted_at IS NULL
		  AND vs.tradition = COALESCE((SELECT tradition FROM viewer), vs.tradition)
		  AND vs.author_id NOT IN (SELECT uid FROM blocked_ids)
	`
)

// verseListQuery monta a listagem de um stream a partir da CTE de ids visíveis.
// limitParam/offsetParam variam porque alguns streams consomem $2 para outro fim.
func verseListQuery(idsCTE, limitParam, offsetParam string) string {
	return `WITH ` + verseViewerCTEs + `, visible AS (` + idsCTE + `)
		SELECT ` + verseShareColumns + verseShareFrom + `
		INNER JOIN visible v ON v.id = vs.id
		ORDER BY vs.created_at DESC
		LIMIT ` + limitParam + ` OFFSET ` + offsetParam
}

func verseCountQuery(idsCTE string) string {
	return `WITH ` + verseViewerCTEs + `, visible AS (` + idsCTE + `)
		SELECT COUNT(*)::bigint FROM visible`
}

func (r *PostgresRepository) listVerseShares(ctx context.Context, query string, args ...any) ([]models.VerseShare, error) {
	rows, err := r.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanVerseShares(rows)
}

// ListHomeVerseShares devolve os compartilhamentos do mural principal: os
// próprios (inclusive PRIVATE), os de amigos marcados PUBLIC ou FRIENDS, e os
// GROUP_ONLY dos grupos onde o viewer é membro.
func (r *PostgresRepository) ListHomeVerseShares(ctx context.Context, userID string, limit, offset int) ([]models.VerseShare, error) {
	return r.listVerseShares(ctx, verseListQuery(verseIDsHome, "$2", "$3"), userID, limit, offset)
}

func (r *PostgresRepository) CountHomeVerseShares(ctx context.Context, userID string) (int64, error) {
	var total int64
	err := r.db.QueryRow(ctx, verseCountQuery(verseIDsHome), userID).Scan(&total)
	return total, err
}

// ListFriendsVerseShares devolve os compartilhamentos de amigos visíveis ao viewer.
func (r *PostgresRepository) ListFriendsVerseShares(ctx context.Context, userID string, limit, offset int) ([]models.VerseShare, error) {
	return r.listVerseShares(ctx, verseListQuery(verseIDsFriends, "$2", "$3"), userID, limit, offset)
}

func (r *PostgresRepository) CountFriendsVerseShares(ctx context.Context, userID string) (int64, error) {
	var total int64
	err := r.db.QueryRow(ctx, verseCountQuery(verseIDsFriends), userID).Scan(&total)
	return total, err
}

// ListGroupsVerseShares devolve os compartilhamentos dirigidos aos grupos do viewer.
func (r *PostgresRepository) ListGroupsVerseShares(ctx context.Context, userID string, limit, offset int) ([]models.VerseShare, error) {
	return r.listVerseShares(ctx, verseListQuery(verseIDsGroups, "$2", "$3"), userID, limit, offset)
}

func (r *PostgresRepository) CountGroupsVerseShares(ctx context.Context, userID string) (int64, error) {
	var total int64
	err := r.db.QueryRow(ctx, verseCountQuery(verseIDsGroups), userID).Scan(&total)
	return total, err
}

// ListVerseSharesByGroup devolve os compartilhamentos do mural de um grupo.
func (r *PostgresRepository) ListVerseSharesByGroup(ctx context.Context, viewerUserID, groupID string, limit, offset int) ([]models.VerseShare, error) {
	return r.listVerseShares(ctx, verseListQuery(verseIDsByGroup, "$3", "$4"), viewerUserID, groupID, limit, offset)
}

func (r *PostgresRepository) CountVerseSharesByGroup(ctx context.Context, viewerUserID, groupID string) (int64, error) {
	var total int64
	err := r.db.QueryRow(ctx, verseCountQuery(verseIDsByGroup), viewerUserID, groupID).Scan(&total)
	return total, err
}

// verseWherePublic monta o predicado do feed público com o viewer no
// placeholder informado — a listagem o recebe em $3, a contagem em $1.
// Tolera viewer anônimo (string vazia): sem viewer não há filtro de tradição
// nem de bloqueio, o mesmo truque de NULLIF/COALESCE de ListPublicPrayerRequests.
func verseWherePublic(viewerParam string) string {
	v := "NULLIF(" + viewerParam + ", '')::uuid"
	return `
	WHERE vs.visibility = 'PUBLIC'
	  AND vs.deleted_at IS NULL
	  AND vs.tradition = COALESCE(
	      (SELECT tradition FROM users WHERE id = ` + v + ` AND deleted_at IS NULL),
	      vs.tradition
	  )
	  AND NOT EXISTS (
	      SELECT 1 FROM user_blocks ub
	      WHERE ` + v + ` IS NOT NULL
	        AND ((ub.blocker_user_id = ` + v + ` AND ub.blocked_user_id = vs.author_id)
	          OR (ub.blocked_user_id = ` + v + ` AND ub.blocker_user_id = vs.author_id))
	  )
`
}

// ListPublicVerseShares devolve o feed público, acessível sem autenticação.
func (r *PostgresRepository) ListPublicVerseShares(ctx context.Context, viewerUserID string, limit, offset int) ([]models.VerseShare, error) {
	return r.listVerseShares(ctx, `
		SELECT `+verseShareColumns+verseShareFrom+verseWherePublic("$3")+`
		ORDER BY vs.created_at DESC
		LIMIT $1 OFFSET $2
	`, limit, offset, viewerUserID)
}

func (r *PostgresRepository) CountPublicVerseShares(ctx context.Context, viewerUserID string) (int64, error) {
	var total int64
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)::bigint
	`+verseShareFrom+verseWherePublic("$1"), viewerUserID).Scan(&total)
	return total, err
}
