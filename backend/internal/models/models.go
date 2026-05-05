package models

import "time"

type Visibility string

type PrayerCategory string

type PrayerStatus string
type PrayerActionType string

type Tradition string

type GroupJoinPolicy string

type GroupRole string

type ModerationActionType string

const (
	VisibilityPublic    Visibility = "PUBLIC"
	VisibilityGroupOnly Visibility = "GROUP_ONLY"
	VisibilityPrivate   Visibility = "PRIVATE"
)

const (
	CategoryHealth       PrayerCategory = "HEALTH"
	CategoryFamily       PrayerCategory = "FAMILY"
	CategoryWork         PrayerCategory = "WORK"
	CategoryGrief        PrayerCategory = "GRIEF"
	CategoryThanksgiving PrayerCategory = "THANKSGIVING"
	CategoryOther        PrayerCategory = "OTHER"
)

const (
	StatusPendingReview PrayerStatus = "PENDING_REVIEW"
	StatusActive        PrayerStatus = "ACTIVE"
	StatusClosed        PrayerStatus = "CLOSED"
	StatusArchived      PrayerStatus = "ARCHIVED"
	StatusRemoved       PrayerStatus = "REMOVED"
)

const (
	PrayerActionHailMary     PrayerActionType = "HAIL_MARY"
	PrayerActionOurFather    PrayerActionType = "OUR_FATHER"
	PrayerActionGloryBe      PrayerActionType = "GLORY_BE"
	PrayerActionRosaryDecade PrayerActionType = "ROSARY_DECADE"
	PrayerActionRosaryFull   PrayerActionType = "ROSARY_FULL"

	PrayerActionIPrayed      PrayerActionType = "I_PRAYED"
	PrayerActionIntercession PrayerActionType = "INTERCESSION"
	PrayerActionFasting      PrayerActionType = "FASTING"
	PrayerActionGratitude    PrayerActionType = "GRATITUDE"
	PrayerActionCryingOut    PrayerActionType = "CRYING_OUT"
)

const (
	TraditionCatholic    Tradition = "CATHOLIC"
	TraditionEvangelical Tradition = "EVANGELICAL"
)

const (
	JoinPolicyOpen       GroupJoinPolicy = "OPEN"
	JoinPolicyRequest    GroupJoinPolicy = "REQUEST"
	JoinPolicyInviteOnly GroupJoinPolicy = "INVITE_ONLY"
)

const (
	RoleMember    GroupRole = "MEMBER"
	RoleModerator GroupRole = "MODERATOR"
	RoleAdmin     GroupRole = "ADMIN"
)

const (
	ActionApprove        ModerationActionType = "APPROVE"
	ActionReject         ModerationActionType = "REJECT"
	ActionRequestChanges ModerationActionType = "REQUEST_CHANGES"
	ActionRemove         ModerationActionType = "REMOVE"
	ActionBan            ModerationActionType = "BAN"
)

type User struct {
	ID          string    `json:"id"`
	Email       string    `json:"email"`
	Username    string    `json:"username"`
	DisplayName string    `json:"displayName"`
	AvatarURL   *string   `json:"avatarUrl,omitempty"`
	Bio         *string   `json:"bio,omitempty"`
	Tradition   Tradition `json:"tradition"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type PublicFriendshipState string

const (
	PublicFriendshipSelf       PublicFriendshipState = "SELF"
	PublicFriendshipFriend     PublicFriendshipState = "FRIEND"
	PublicFriendshipPendingOut PublicFriendshipState = "PENDING_OUT"
	PublicFriendshipPendingIn  PublicFriendshipState = "PENDING_IN"
	PublicFriendshipNone       PublicFriendshipState = "NONE"
	PublicFriendshipBlockedByMe   PublicFriendshipState = "BLOCKED_BY_ME"
	PublicFriendshipBlockedByThem PublicFriendshipState = "BLOCKED_BY_THEM"
)

type ProfileStats struct {
	RequestsCreated         int            `json:"requestsCreated"`
	PrayerActionsTotal      int            `json:"prayerActionsTotal"`
	PrayerActionsByType     map[string]int `json:"prayerActionsByType"`
	PrayerActionsByCategory map[string]int `json:"prayerActionsByCategory"`
}

type PublicProfile struct {
	User                User                  `json:"user"`
	FriendshipStatus    PublicFriendshipState `json:"friendshipStatus"`
	IncomingFriendReqID *string               `json:"incomingFriendRequestId,omitempty"`
	OutgoingFriendReqID *string               `json:"outgoingFriendRequestId,omitempty"`
	Stats               *ProfileStats         `json:"stats,omitempty"`
}

type PrayerRequest struct {
	ID                string           `json:"id"`
	AuthorID          string           `json:"authorId"`
	AuthorUsername    string           `json:"authorUsername,omitempty"`
	AuthorDisplayName string           `json:"authorDisplayName,omitempty"`
	AuthorAvatarURL   *string          `json:"authorAvatarUrl,omitempty"`
	Title             string           `json:"title"`
	Body              string           `json:"body"`
	Category          PrayerCategory   `json:"category"`
	Visibility        Visibility       `json:"visibility"`
	Tradition         Tradition        `json:"tradition"`
	AllowAnonymous    bool             `json:"allowAnonymous"`
	Status            PrayerStatus     `json:"status"`
	PrayedCount       int64            `json:"prayedCount"`
	GroupIDs          []string         `json:"groupIds,omitempty"`
	GroupNames        []string         `json:"groupNames,omitempty"`
	PrayerTypeCounts  map[string]int64 `json:"prayerTypeCounts,omitempty"`
	MyPrayerTypes     []string         `json:"myPrayerTypes,omitempty"`
	CreatedAt         time.Time        `json:"createdAt"`
	UpdatedAt         time.Time        `json:"updatedAt"`
}

type CreatePrayerRequestInput struct {
	AuthorID       string
	Title          string
	Body           string
	Category       PrayerCategory
	Visibility     Visibility
	AllowAnonymous bool
	GroupIDs       []string
}

type UpdatePrayerRequestInput struct {
	RequestID      string
	EditorID       string
	Title          string
	Body           string
	Category       PrayerCategory
	Visibility     Visibility
	AllowAnonymous bool
	GroupIDs       []string
}

type Group struct {
	ID                 string          `json:"id"`
	Name               string          `json:"name"`
	Description        string          `json:"description"`
	ImageURL           *string         `json:"imageUrl,omitempty"`
	JoinPolicy         GroupJoinPolicy `json:"joinPolicy"`
	RequiresModeration bool            `json:"requiresModeration"`
	CreatedBy          string          `json:"createdBy"`
	CreatedAt          time.Time       `json:"createdAt"`
	UpdatedAt          time.Time       `json:"updatedAt"`
}

type GroupSummary struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	JoinPolicy  GroupJoinPolicy `json:"joinPolicy"`
	IsMember    bool            `json:"isMember"`
}

type GroupDetails struct {
	Group
	MemberCount    int64      `json:"memberCount"`
	MyRole         *GroupRole `json:"myRole,omitempty"`
	IsMember       bool       `json:"isMember"`
	HasPendingJoin bool       `json:"hasPendingJoin"`
}

type GroupMember struct {
	UserID      string    `json:"userId"`
	Username    string    `json:"username"`
	DisplayName string    `json:"displayName"`
	AvatarURL   *string   `json:"avatarUrl,omitempty"`
	Role        GroupRole `json:"role"`
	JoinedAt    time.Time `json:"joinedAt"`
}

type UpdateGroupInput struct {
	Name        *string
	Description *string
	ImageURL    *string
	JoinPolicy  *GroupJoinPolicy
}

func RoleRank(role GroupRole) int {
	switch role {
	case RoleAdmin:
		return 3
	case RoleModerator:
		return 2
	case RoleMember:
		return 1
	default:
		return 0
	}
}

func IsValidGroupRole(role GroupRole) bool {
	switch role {
	case RoleMember, RoleModerator, RoleAdmin:
		return true
	default:
		return false
	}
}

type GroupJoinRequest struct {
	ID          string    `json:"id"`
	GroupID     string    `json:"groupId"`
	UserID      string    `json:"userId"`
	Username    string    `json:"username"`
	DisplayName string    `json:"displayName"`
	AvatarURL   *string   `json:"avatarUrl,omitempty"`
	Status      string    `json:"status"`
	RequestedAt time.Time `json:"requestedAt"`
}

type Friend struct {
	UserID      string    `json:"userId"`
	Username    string    `json:"username"`
	DisplayName string    `json:"displayName"`
	AvatarURL   *string   `json:"avatarUrl,omitempty"`
	ConnectedAt time.Time `json:"connectedAt"`
}

type FriendRequest struct {
	ID          string    `json:"id"`
	FromUserID  string    `json:"fromUserId"`
	Username    string    `json:"username"`
	DisplayName string    `json:"displayName"`
	RequestedAt time.Time `json:"requestedAt"`
}

type UserSummary struct {
	UserID      string  `json:"userId"`
	Username    string  `json:"username"`
	DisplayName string  `json:"displayName"`
	AvatarURL   *string `json:"avatarUrl,omitempty"`
}

type BlockedUser struct {
	UserID      string    `json:"userId"`
	Username    string    `json:"username"`
	DisplayName string    `json:"displayName"`
	AvatarURL   *string   `json:"avatarUrl,omitempty"`
	BlockedAt   time.Time `json:"blockedAt"`
}

type NotificationType string

const (
	NotificationTypePrayed                NotificationType = "PRAYED"
	NotificationTypeFriendRequestReceived NotificationType = "FRIEND_REQUEST_RECEIVED"
	NotificationTypeFriendRequestAccepted NotificationType = "FRIEND_REQUEST_ACCEPTED"
	NotificationTypeGroupJoinApproved     NotificationType = "GROUP_JOIN_APPROVED"
	NotificationTypeGroupJoinRequested    NotificationType = "GROUP_JOIN_REQUESTED"
	NotificationTypeRequestApproved       NotificationType = "REQUEST_APPROVED"
	NotificationTypeRequestRejected       NotificationType = "REQUEST_REJECTED"
	NotificationTypeRequestChangesAsked   NotificationType = "REQUEST_CHANGES_ASKED"
)

type NotificationSubjectType string

const (
	NotificationSubjectPrayerRequest NotificationSubjectType = "PRAYER_REQUEST"
	NotificationSubjectFriendship    NotificationSubjectType = "FRIENDSHIP"
	NotificationSubjectGroup         NotificationSubjectType = "GROUP"
)

type NotificationActor struct {
	UserID      string  `json:"userId"`
	Username    string  `json:"username"`
	DisplayName string  `json:"displayName"`
	AvatarURL   *string `json:"avatarUrl,omitempty"`
}

type NotificationView struct {
	ID          string                  `json:"id"`
	Type        NotificationType        `json:"type"`
	SubjectType NotificationSubjectType `json:"subjectType"`
	SubjectID   string                  `json:"subjectId"`
	Actor       *NotificationActor      `json:"actor,omitempty"`
	Payload     map[string]any          `json:"payload"`
	ReadAt      *time.Time              `json:"readAt,omitempty"`
	CreatedAt   time.Time               `json:"createdAt"`
}

type ModerationQueueItem struct {
	ID                string         `json:"id"`
	GroupID           string         `json:"groupId"`
	GroupName         string         `json:"groupName"`
	AuthorID          string         `json:"authorId"`
	AuthorUsername    string         `json:"authorUsername"`
	AuthorDisplayName string         `json:"authorDisplayName"`
	AuthorAvatarURL   *string        `json:"authorAvatarUrl,omitempty"`
	Title             string         `json:"title"`
	Body              string         `json:"body"`
	Category          PrayerCategory `json:"category"`
	Visibility        Visibility     `json:"visibility"`
	CreatedAt         time.Time      `json:"createdAt"`
}

type ModerationActionRecord struct {
	ID              string               `json:"id"`
	PrayerRequestID string               `json:"prayerRequestId"`
	GroupID         *string              `json:"groupId,omitempty"`
	ActorUserID     string               `json:"actorUserId"`
	Action          ModerationActionType `json:"action"`
	Reason          *string              `json:"reason,omitempty"`
	CreatedAt       time.Time            `json:"createdAt"`
}

type CreateNotificationInput struct {
	UserID      string
	Type        NotificationType
	ActorUserID *string
	SubjectType NotificationSubjectType
	SubjectID   string
	Payload     map[string]any
}
