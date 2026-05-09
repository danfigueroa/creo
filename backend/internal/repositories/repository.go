package repositories

import (
	"context"
	"encoding/json"
	"errors"
	"log"
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

type Repository interface {
	GetUserByID(ctx context.Context, userID string) (models.User, error)
	GetUserByUsername(ctx context.Context, username string) (models.User, error)
	UpdateUserProfile(ctx context.Context, userID, displayName, username string, avatarURL *string, setAvatar bool, bio *string, setBio bool) (models.User, error)
	GetFriendshipState(ctx context.Context, viewerID, ownerID string) (models.PublicFriendshipState, *string, *string, error)
	GetUserStats(ctx context.Context, userID string) (models.ProfileStats, error)
	UpsertAuthUser(ctx context.Context, userID, email, preferredUsername, preferredDisplayName, preferredTradition string) error
	SetUserTradition(ctx context.Context, userID string, tradition models.Tradition) (models.User, error)
	UsernameExists(ctx context.Context, username string) (bool, error)
	CreatePrayerRequest(ctx context.Context, in models.CreatePrayerRequestInput) (models.PrayerRequest, error)
	UpdatePrayerRequest(ctx context.Context, in models.UpdatePrayerRequestInput) (models.PrayerRequest, error)
	DeletePrayerRequest(ctx context.Context, userID, requestID string) error
	GetPrayerRequestByID(ctx context.Context, userID, requestID string) (models.PrayerRequest, error)
	ListPublicPrayerRequests(ctx context.Context, viewerUserID string, limit, offset int) ([]models.PrayerRequest, error)
	CountPublicPrayerRequests(ctx context.Context, viewerUserID string) (int64, error)
	ListGroupsPrayerRequests(ctx context.Context, userID string, limit, offset int) ([]models.PrayerRequest, error)
	CountGroupsPrayerRequests(ctx context.Context, userID string) (int64, error)
	ListFriendsPrayerRequests(ctx context.Context, userID string, limit, offset int) ([]models.PrayerRequest, error)
	CountFriendsPrayerRequests(ctx context.Context, userID string) (int64, error)
	ListHomePrayerRequests(ctx context.Context, userID string, limit, offset int) ([]models.PrayerRequest, error)
	CountHomePrayerRequests(ctx context.Context, userID string) (int64, error)
	RecordPrayerAction(ctx context.Context, userID, requestID string, actionType models.PrayerActionType, windowHours int) error
	ListPrayerActionsByRequest(ctx context.Context, requestID string) ([]models.PrayerActionRecord, error)
	ListMyPrayers(ctx context.Context, userID string, limit, offset int) ([]models.MyPrayerEntry, error)
	CreatePrayerRequestUpdate(ctx context.Context, requestID, authorID, body string) (models.PrayerRequestUpdate, error)
	ListPrayerRequestUpdates(ctx context.Context, requestID string) ([]models.PrayerRequestUpdate, error)
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
	ListModerationHistory(ctx context.Context, requestID string) ([]models.ModerationActionRecord, error)
	CreateNotification(ctx context.Context, in models.CreateNotificationInput) error
	ListNotifications(ctx context.Context, userID string, limit, offset int) ([]models.NotificationView, error)
	CountUnreadNotifications(ctx context.Context, userID string) (int64, error)
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
		SELECT id::text, email, username, display_name, avatar_url, bio, tradition, created_at, updated_at
		FROM users
		WHERE id = $1 AND deleted_at IS NULL
	`, userID).Scan(&u.ID, &u.Email, &u.Username, &u.DisplayName, &u.AvatarURL, &u.Bio, &u.Tradition, &u.CreatedAt, &u.UpdatedAt)
	return u, err
}

func (r *PostgresRepository) GetUserByUsername(ctx context.Context, username string) (models.User, error) {
	var u models.User
	err := r.db.QueryRow(ctx, `
		SELECT id::text, email, username, display_name, avatar_url, bio, tradition, created_at, updated_at
		FROM users
		WHERE LOWER(username) = LOWER($1) AND deleted_at IS NULL
	`, username).Scan(&u.ID, &u.Email, &u.Username, &u.DisplayName, &u.AvatarURL, &u.Bio, &u.Tradition, &u.CreatedAt, &u.UpdatedAt)
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
		RETURNING id::text, email, username, display_name, avatar_url, bio, tradition, created_at, updated_at
	`, userID, displayName, username, avatarURL, setAvatar, bio, setBio).Scan(&u.ID, &u.Email, &u.Username, &u.DisplayName, &u.AvatarURL, &u.Bio, &u.Tradition, &u.CreatedAt, &u.UpdatedAt)
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
		SET tradition = $2, updated_at = NOW()
		WHERE id = $1 AND deleted_at IS NULL
		RETURNING id::text, email, username, display_name, avatar_url, bio, tradition, created_at, updated_at
	`, userID, tradition).Scan(&u.ID, &u.Email, &u.Username, &u.DisplayName, &u.AvatarURL, &u.Bio, &u.Tradition, &u.CreatedAt, &u.UpdatedAt)
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

func (r *PostgresRepository) GetUserStats(ctx context.Context, userID string) (models.ProfileStats, error) {
	stats := models.ProfileStats{
		PrayerActionsByType:     map[string]int{},
		PrayerActionsByCategory: map[string]int{},
	}
	if err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)::int
		FROM prayer_requests
		WHERE author_id = $1 AND deleted_at IS NULL
	`, userID).Scan(&stats.RequestsCreated); err != nil {
		return models.ProfileStats{}, err
	}

	rows, err := r.db.Query(ctx, `
		SELECT action_type, COUNT(*)::int
		FROM prayer_actions
		WHERE user_id = $1
		GROUP BY action_type
	`, userID)
	if err != nil {
		return models.ProfileStats{}, err
	}
	for rows.Next() {
		var t string
		var c int
		if err = rows.Scan(&t, &c); err != nil {
			rows.Close()
			return models.ProfileStats{}, err
		}
		stats.PrayerActionsByType[t] = c
		stats.PrayerActionsTotal += c
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return models.ProfileStats{}, err
	}

	rows, err = r.db.Query(ctx, `
		SELECT pr.category::text, COUNT(*)::int
		FROM prayer_actions pa
		INNER JOIN prayer_requests pr ON pr.id = pa.prayer_request_id
		WHERE pa.user_id = $1 AND pr.deleted_at IS NULL
		GROUP BY pr.category
	`, userID)
	if err != nil {
		return models.ProfileStats{}, err
	}
	for rows.Next() {
		var cat string
		var c int
		if err = rows.Scan(&cat, &c); err != nil {
			rows.Close()
			return models.ProfileStats{}, err
		}
		stats.PrayerActionsByCategory[cat] = c
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return models.ProfileStats{}, err
	}

	// Prayers received: count of prayer_actions on every request the user
	// authored (excluding deleted requests).
	if err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)::int
		FROM prayer_actions pa
		INNER JOIN prayer_requests pr ON pr.id = pa.prayer_request_id
		WHERE pr.author_id = $1 AND pr.deleted_at IS NULL
	`, userID).Scan(&stats.PrayerActionsReceived); err != nil {
		return models.ProfileStats{}, err
	}

	// Streak: longest run of consecutive days ending today (or yesterday) where
	// the user recorded at least one prayer action. Computed from the distinct
	// day series in prayer_actions. Cheap enough at this scale; if the table
	// grows we can move to a materialized counter or daily cron.
	streakRow := r.db.QueryRow(ctx, `
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
	if err := streakRow.Scan(&stats.StreakDays); err != nil {
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
	_, err := r.db.Exec(ctx, `
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
	`, userID, email, preferredUsername, preferredDisplayName, preferredTradition)
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

func (r *PostgresRepository) GetPrayerRequestByID(ctx context.Context, userID, requestID string) (models.PrayerRequest, error) {
	var pr models.PrayerRequest
	err := r.db.QueryRow(ctx, `
		SELECT id::text, author_id::text, title, body, category, visibility, tradition, allow_anonymous, status, prayed_count, created_at, updated_at
		FROM prayer_requests
		WHERE id = $1
		  AND deleted_at IS NULL
		  AND tradition = COALESCE(
			(SELECT tradition FROM users WHERE id = $2 AND deleted_at IS NULL),
			prayer_requests.tradition
		  )
		  AND (
			author_id = $2
			OR (visibility = 'PUBLIC' AND status = 'ACTIVE')
			OR (
				visibility = 'GROUP_ONLY'
				AND status = 'ACTIVE'
				AND EXISTS (
					SELECT 1
					FROM prayer_request_groups prg
					INNER JOIN group_memberships gm ON gm.group_id = prg.group_id
					WHERE prg.prayer_request_id = prayer_requests.id
					  AND gm.user_id = $2
					  AND gm.deleted_at IS NULL
				)
			)
		  )
	`, requestID, userID).Scan(&pr.ID, &pr.AuthorID, &pr.Title, &pr.Body, &pr.Category, &pr.Visibility, &pr.Tradition, &pr.AllowAnonymous, &pr.Status, &pr.PrayedCount, &pr.CreatedAt, &pr.UpdatedAt)
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

	items, err := scanPrayerRequests(rows)
	if err != nil {
		return nil, err
	}
	if err = r.enrichPrayerRequests(ctx, viewerUserID, items); err != nil {
		return nil, err
	}
	return items, nil
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

func (r *PostgresRepository) RecordPrayerAction(ctx context.Context, userID, requestID string, actionType models.PrayerActionType, windowHours int) error {
	ct, err := r.db.Exec(ctx, `
		INSERT INTO prayer_actions (user_id, prayer_request_id, action_type)
		SELECT $1, $2, $3
		WHERE NOT EXISTS (
			SELECT 1
			FROM prayer_actions
			WHERE user_id = $1
			AND prayer_request_id = $2
			AND action_type = $3
			AND created_at > NOW() - ($4::text || ' hours')::interval
		)
	`, userID, requestID, actionType, windowHours)
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		return ErrDuplicatePrayedAction
	}

	_, err = r.db.Exec(ctx, `
		UPDATE prayer_requests
		SET prayed_count = prayed_count + 1, updated_at = NOW()
		WHERE id = $1 AND deleted_at IS NULL
	`, requestID)
	if err != nil {
		return err
	}

	var authorID string
	if err := r.db.QueryRow(ctx, `
		SELECT author_id::text FROM prayer_requests WHERE id = $1 AND deleted_at IS NULL
	`, requestID).Scan(&authorID); err == nil && authorID != "" && authorID != userID {
		// Dedup: don't emit a fresh PRAYED notification when the same actor
		// has already triggered one for this request in the last 60 minutes.
		// Avoids spamming the author when someone reacts multiple times.
		var recent bool
		_ = r.db.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1 FROM notifications
				WHERE user_id = $1::uuid
				  AND type = 'PRAYED'
				  AND actor_user_id = $2::uuid
				  AND subject_id = $3::uuid
				  AND created_at > NOW() - INTERVAL '60 minutes'
			)
		`, authorID, userID, requestID).Scan(&recent)
		if !recent {
			actor := userID
			_ = insertNotificationOn(ctx, r.db, models.CreateNotificationInput{
				UserID:      authorID,
				Type:        models.NotificationTypePrayed,
				ActorUserID: &actor,
				SubjectType: models.NotificationSubjectPrayerRequest,
				SubjectID:   requestID,
				Payload:     map[string]any{"actionType": string(actionType)},
			})
		}
	}

	r.maybeEmitPrayedMilestone(ctx, userID)
	r.maybeEmitStreakMilestone(ctx, userID)

	return nil
}

var prayedMilestones = []int{10, 50, 100, 500, 1000}
var createdMilestones = []int{1, 10, 50, 100}
var streakMilestones = []int{7, 30, 100, 365}

// maybeEmitPrayedMilestone fires MILESTONE_PRAYED when the user's total prayer
// actions hits one of the threshold values exactly. Idempotent because the
// count crosses each threshold once.
func (r *PostgresRepository) maybeEmitPrayedMilestone(ctx context.Context, userID string) {
	var total int
	if err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM prayer_actions WHERE user_id = $1
	`, userID).Scan(&total); err != nil {
		return
	}
	for _, m := range prayedMilestones {
		if total == m {
			_ = insertNotificationOn(ctx, r.db, models.CreateNotificationInput{
				UserID:      userID,
				Type:        models.NotificationTypeMilestonePrayed,
				SubjectType: models.NotificationSubjectMilestone,
				SubjectID:   userID,
				Payload:     map[string]any{"count": m},
			})
			return
		}
	}
}

// maybeEmitStreakMilestone fires MILESTONE_STREAK when, on the user's first
// prayer action of today (in São Paulo time), the running streak hits one of
// the threshold values. Idempotent because the "first action of today" gate
// only opens once per day.
func (r *PostgresRepository) maybeEmitStreakMilestone(ctx context.Context, userID string) {
	var todayCount int
	if err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)::int FROM prayer_actions
		WHERE user_id = $1::uuid
		  AND (created_at AT TIME ZONE 'America/Sao_Paulo')::date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
	`, userID).Scan(&todayCount); err != nil {
		return
	}
	if todayCount != 1 {
		return
	}

	var streak int
	if err := r.db.QueryRow(ctx, `
		WITH days AS (
			SELECT DISTINCT (created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day
			FROM prayer_actions
			WHERE user_id = $1::uuid
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
	`, userID).Scan(&streak); err != nil {
		return
	}
	for _, m := range streakMilestones {
		if streak == m {
			_ = insertNotificationOn(ctx, r.db, models.CreateNotificationInput{
				UserID:      userID,
				Type:        models.NotificationTypeMilestoneStreak,
				SubjectType: models.NotificationSubjectMilestone,
				SubjectID:   userID,
				Payload:     map[string]any{"days": m},
			})
			return
		}
	}
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
	items, err := scanPrayerRequests(rows)
	if err != nil {
		return nil, err
	}
	if err = r.enrichPrayerRequests(ctx, userID, items); err != nil {
		return nil, err
	}
	return items, nil
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
	items, err := scanPrayerRequests(rows)
	if err != nil {
		return nil, err
	}
	if err = r.enrichPrayerRequests(ctx, userID, items); err != nil {
		return nil, err
	}
	return items, nil
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
	items, err := scanPrayerRequests(rows)
	if err != nil {
		return nil, err
	}
	if err = r.enrichPrayerRequests(ctx, userID, items); err != nil {
		return nil, err
	}
	return items, nil
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

func (r *PostgresRepository) isGroupAdmin(ctx context.Context, userID, groupID string) (bool, error) {
	var exists bool
	err := r.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM groups g
			LEFT JOIN group_memberships gm ON gm.group_id = g.id AND gm.user_id = $1 AND gm.deleted_at IS NULL
			WHERE g.id = $2 AND g.deleted_at IS NULL
			AND (g.created_by = $1 OR gm.role = 'ADMIN')
		)
	`, userID, groupID).Scan(&exists)
	return exists, err
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

	authorRows, err := r.db.Query(ctx, `
		SELECT id::text, username, display_name, avatar_url
		FROM users
		WHERE id = ANY($1::uuid[])
	`, authorIDs)
	if err != nil {
		return err
	}
	defer authorRows.Close()

	authorByID := make(map[string]struct {
		username    string
		displayName string
		avatarURL   *string
	}, len(authorIDs))
	for authorRows.Next() {
		var id, username, displayName string
		var avatarURL *string
		if err = authorRows.Scan(&id, &username, &displayName, &avatarURL); err != nil {
			return err
		}
		authorByID[id] = struct {
			username    string
			displayName string
			avatarURL   *string
		}{
			username:    username,
			displayName: displayName,
			avatarURL:   avatarURL,
		}
	}
	if err = authorRows.Err(); err != nil {
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

	groupRows, err := r.db.Query(ctx, `
		SELECT prg.prayer_request_id::text, prg.group_id::text, g.name
		FROM prayer_request_groups prg
		INNER JOIN groups g ON g.id = prg.group_id
		WHERE prg.prayer_request_id = ANY($1::uuid[])
		  AND g.deleted_at IS NULL
	`, ids)
	if err != nil {
		return err
	}
	defer groupRows.Close()

	for groupRows.Next() {
		var requestID, groupID, groupName string
		if err = groupRows.Scan(&requestID, &groupID, &groupName); err != nil {
			return err
		}
		idx, ok := indexByID[requestID]
		if !ok {
			continue
		}
		items[idx].GroupIDs = append(items[idx].GroupIDs, groupID)
		items[idx].GroupNames = append(items[idx].GroupNames, groupName)
	}
	if err = groupRows.Err(); err != nil {
		return err
	}

	rows, err := r.db.Query(ctx, `
		SELECT prayer_request_id::text, action_type, COUNT(*)::bigint
		FROM prayer_actions
		WHERE prayer_request_id = ANY($1::uuid[])
		GROUP BY prayer_request_id, action_type
	`, ids)
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var requestID, actionType string
		var count int64
		if err = rows.Scan(&requestID, &actionType, &count); err != nil {
			return err
		}
		idx, ok := indexByID[requestID]
		if !ok {
			continue
		}
		items[idx].PrayerTypeCounts[actionType] = count
	}
	if err = rows.Err(); err != nil {
		return err
	}

	if userID == "" {
		return nil
	}

	userRows, err := r.db.Query(ctx, `
		SELECT DISTINCT prayer_request_id::text, action_type
		FROM prayer_actions
		WHERE user_id = $1
		  AND prayer_request_id = ANY($2::uuid[])
	`, userID, ids)
	if err != nil {
		return err
	}
	defer userRows.Close()

	for userRows.Next() {
		var requestID, actionType string
		if err = userRows.Scan(&requestID, &actionType); err != nil {
			return err
		}
		idx, ok := indexByID[requestID]
		if !ok {
			continue
		}
		items[idx].MyPrayerTypes = append(items[idx].MyPrayerTypes, actionType)
	}
	return userRows.Err()
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

func (r *PostgresRepository) ListFriends(ctx context.Context, userID string) ([]models.Friend, error) {
	rows, err := r.db.Query(ctx, `
		WITH friend_pairs AS (
			SELECT
				CASE WHEN user_id = $1 THEN friend_user_id ELSE user_id END AS friend_id,
				updated_at
			FROM friendships
			WHERE status = 'ACCEPTED'
			  AND (user_id = $1 OR friend_user_id = $1)
		)
		SELECT u.id::text, u.username, u.display_name, u.avatar_url, fp.updated_at
		FROM friend_pairs fp
		INNER JOIN users u ON u.id = fp.friend_id
		WHERE u.deleted_at IS NULL
		ORDER BY fp.updated_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]models.Friend, 0)
	for rows.Next() {
		var item models.Friend
		err = rows.Scan(&item.UserID, &item.Username, &item.DisplayName, &item.AvatarURL, &item.ConnectedAt)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *PostgresRepository) ListPendingFriendRequests(ctx context.Context, userID string) ([]models.FriendRequest, error) {
	rows, err := r.db.Query(ctx, `
		SELECT f.id::text, u.id::text, u.username, u.display_name, f.created_at
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
		err = rows.Scan(&item.ID, &item.FromUserID, &item.Username, &item.DisplayName, &item.RequestedAt)
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	return items, rows.Err()
}

func (r *PostgresRepository) AcceptFriendRequest(ctx context.Context, userID, requestID string) error {
	var senderID string
	err := r.db.QueryRow(ctx, `
		UPDATE friendships
		SET status = 'ACCEPTED', updated_at = NOW()
		WHERE id = $1
		  AND friend_user_id = $2
		  AND status = 'PENDING'
		RETURNING user_id::text
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
	tag, err := r.db.Exec(ctx, `
		DELETE FROM friendships
		WHERE id = $1
		  AND friend_user_id = $2
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
	rows, err := r.db.Query(ctx, `
		SELECT u.id::text, u.username, u.display_name, u.avatar_url
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
			  WHERE (f.user_id = $1 AND f.friend_user_id = u.id)
			     OR (f.user_id = u.id AND f.friend_user_id = $1)
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
		err = rows.Scan(&item.UserID, &item.Username, &item.DisplayName, &item.AvatarURL)
		if err != nil {
			return nil, err
		}
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

func (r *PostgresRepository) GetGroupRoleOf(ctx context.Context, userID, groupID string) (models.GroupRole, bool, error) {
	var role string
	err := r.db.QueryRow(ctx, `
		SELECT role::text FROM group_memberships
		WHERE group_id = $1 AND user_id = $2 AND deleted_at IS NULL
	`, groupID, userID).Scan(&role)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", false, nil
		}
		return "", false, err
	}
	return models.GroupRole(role), true, nil
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
	items, err := scanPrayerRequests(rows)
	if err != nil {
		return nil, err
	}
	if err = r.enrichPrayerRequests(ctx, viewerUserID, items); err != nil {
		return nil, err
	}
	return items, nil
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

func (r *PostgresRepository) ListNotifications(ctx context.Context, userID string, limit, offset int) ([]models.NotificationView, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	rows, err := r.db.Query(ctx, `
		SELECT n.id::text, n.type, n.subject_type, n.subject_id::text, n.payload, n.read_at, n.created_at,
		       a.id::text, a.username, a.display_name, a.avatar_url
		FROM notifications n
		LEFT JOIN users a ON a.id = n.actor_user_id AND a.deleted_at IS NULL
		WHERE n.user_id = $1
		ORDER BY n.created_at DESC
		LIMIT $2 OFFSET $3
	`, userID, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make([]models.NotificationView, 0)
	for rows.Next() {
		var (
			n              models.NotificationView
			payloadBytes   []byte
			actorID        *string
			actorUsername  *string
			actorDisplay   *string
			actorAvatarURL *string
		)
		if err = rows.Scan(&n.ID, &n.Type, &n.SubjectType, &n.SubjectID, &payloadBytes, &n.ReadAt, &n.CreatedAt,
			&actorID, &actorUsername, &actorDisplay, &actorAvatarURL); err != nil {
			return nil, err
		}
		if len(payloadBytes) > 0 {
			if err = json.Unmarshal(payloadBytes, &n.Payload); err != nil {
				return nil, err
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
	return items, rows.Err()
}

func derefStr(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

func (r *PostgresRepository) CountUnreadNotifications(ctx context.Context, userID string) (int64, error) {
	var n int64
	err := r.db.QueryRow(ctx, `
		SELECT COUNT(*)::bigint
		FROM notifications
		WHERE user_id = $1 AND read_at IS NULL
	`, userID).Scan(&n)
	return n, err
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

func (r *PostgresRepository) ListModerationHistory(ctx context.Context, requestID string) ([]models.ModerationActionRecord, error) {
	rows, err := r.db.Query(ctx, `
		SELECT id::text, prayer_request_id::text, group_id::text, actor_user_id::text, action, reason, created_at
		FROM moderation_actions
		WHERE prayer_request_id = $1
		ORDER BY created_at DESC
	`, requestID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]models.ModerationActionRecord, 0)
	for rows.Next() {
		var it models.ModerationActionRecord
		var groupID *string
		if err := rows.Scan(&it.ID, &it.PrayerRequestID, &groupID, &it.ActorUserID, &it.Action, &it.Reason, &it.CreatedAt); err != nil {
			return nil, err
		}
		it.GroupID = groupID
		items = append(items, it)
	}
	return items, rows.Err()
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
	rows, err := r.db.Query(ctx, `
		SELECT user_id::text
		FROM group_memberships
		WHERE group_id = $1::uuid AND deleted_at IS NULL AND user_id <> $2::uuid
	`, groupID, authorID)
	if err != nil {
		return
	}
	memberIDs := make([]string, 0)
	for rows.Next() {
		var mid string
		if err := rows.Scan(&mid); err != nil {
			rows.Close()
			return
		}
		memberIDs = append(memberIDs, mid)
	}
	rows.Close()

	actor := authorID
	for _, mid := range memberIDs {
		_ = insertNotificationOn(ctx, exec, models.CreateNotificationInput{
			UserID:      mid,
			Type:        models.NotificationTypeGroupAnnouncementPosted,
			ActorUserID: &actor,
			SubjectType: models.NotificationSubjectGroup,
			SubjectID:   groupID,
			Payload: map[string]any{
				"announcementId": announcementID,
				"title":          title,
			},
		})
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

func (r *PostgresRepository) ListPrayerActionsByRequest(ctx context.Context, requestID string) ([]models.PrayerActionRecord, error) {
	rows, err := r.db.Query(ctx, `
		SELECT pa.user_id::text, u.username, u.display_name, u.avatar_url, pa.action_type, pa.created_at
		FROM prayer_actions pa
		INNER JOIN users u ON u.id = pa.user_id AND u.deleted_at IS NULL
		WHERE pa.prayer_request_id = $1::uuid
		ORDER BY pa.created_at DESC
	`, requestID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]models.PrayerActionRecord, 0)
	for rows.Next() {
		var rec models.PrayerActionRecord
		if err := rows.Scan(&rec.UserID, &rec.Username, &rec.DisplayName, &rec.AvatarURL, &rec.ActionType, &rec.CreatedAt); err != nil {
			return nil, err
		}
		items = append(items, rec)
	}
	return items, rows.Err()
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

func (r *PostgresRepository) ListPrayerRequestUpdates(ctx context.Context, requestID string) ([]models.PrayerRequestUpdate, error) {
	rows, err := r.db.Query(ctx, `
		SELECT pru.id::text, pru.prayer_request_id::text, pru.author_id::text,
		       u.username, u.display_name,
		       pru.body, pru.created_at
		FROM prayer_request_updates pru
		INNER JOIN users u ON u.id = pru.author_id AND u.deleted_at IS NULL
		WHERE pru.prayer_request_id = $1::uuid
		ORDER BY pru.created_at DESC
	`, requestID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := make([]models.PrayerRequestUpdate, 0)
	for rows.Next() {
		var u models.PrayerRequestUpdate
		if err := rows.Scan(
			&u.ID, &u.PrayerRequestID, &u.AuthorID,
			&u.AuthorUsername, &u.AuthorDisplayName,
			&u.Body, &u.CreatedAt,
		); err != nil {
			return nil, err
		}
		items = append(items, u)
	}
	return items, rows.Err()
}

// notifyPrayersOfRequestUpdate emits a REQUEST_UPDATED notification for every
// distinct user who has prayed for the request, except the author. Best-effort.
func (r *PostgresRepository) notifyPrayersOfRequestUpdate(ctx context.Context, exec notifyExec, requestID, authorID string) {
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
			Type:        models.NotificationTypeRequestUpdated,
			ActorUserID: &actor,
			SubjectType: models.NotificationSubjectPrayerRequest,
			SubjectID:   requestID,
			Payload:     map[string]any{},
		})
	}
}

var _ Repository = (*PostgresRepository)(nil)
var _ = pgx.ErrNoRows
