package models

import (
	"fmt"
	"time"
)

type Visibility string

type PrayerCategory string

type PrayerStatus string
type PrayerActionType string

type Tradition string

type Language string

type GroupJoinPolicy string

type GroupRole string

type ModerationActionType string

type VerseTheme string

type VerseShareVisibility string

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
	PrayerActionPurpose      PrayerActionType = "PURPOSE"
)

const (
	TraditionCatholic    Tradition = "CATHOLIC"
	TraditionEvangelical Tradition = "EVANGELICAL"
)

// Temas do catálogo curado de versículos. Espelham verse_theme no banco.
const (
	VerseThemeHope        VerseTheme = "HOPE"
	VerseThemeGrief       VerseTheme = "GRIEF"
	VerseThemeGratitude   VerseTheme = "GRATITUDE"
	VerseThemeForgiveness VerseTheme = "FORGIVENESS"
	VerseThemeFaith       VerseTheme = "FAITH"
	VerseThemeFamily      VerseTheme = "FAMILY"
	VerseThemeHealing     VerseTheme = "HEALING"
	VerseThemeProvision   VerseTheme = "PROVISION"
	VerseThemeCourage     VerseTheme = "COURAGE"
	VerseThemePeace       VerseTheme = "PEACE"
	VerseThemeGuidance    VerseTheme = "GUIDANCE"
	VerseThemeLove        VerseTheme = "LOVE"
)

// Visibilidade de um compartilhamento de versículo. Diferente de Visibility,
// inclui FRIENDS: um versículo pode ser dirigido só aos amigos, alcance que
// pedidos de oração não têm.
const (
	VerseVisibilityPublic    VerseShareVisibility = "PUBLIC"
	VerseVisibilityFriends   VerseShareVisibility = "FRIENDS"
	VerseVisibilityGroupOnly VerseShareVisibility = "GROUP_ONLY"
	VerseVisibilityPrivate   VerseShareVisibility = "PRIVATE"
)

const (
	LanguagePtBr Language = "PT_BR"
	LanguageEn   Language = "EN"
	LanguageEs   Language = "ES"
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
	Language    Language  `json:"language"`
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
	PrayerActionsReceived   int            `json:"prayerActionsReceived"`
	StreakDays              int            `json:"streakDays"`
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
	AnsweredAt        *time.Time       `json:"answeredAt,omitempty"`
	Testimony         *string          `json:"testimony,omitempty"`
	CreatedAt         time.Time        `json:"createdAt"`
	UpdatedAt         time.Time        `json:"updatedAt"`
}

type AnswerPrayerRequestInput struct {
	RequestID   string
	ActorUserID string
	Testimony   string
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

type PrayerActionRecord struct {
	UserID      string           `json:"userId"`
	Username    string           `json:"username"`
	DisplayName string           `json:"displayName"`
	AvatarURL   *string          `json:"avatarUrl,omitempty"`
	ActionType  PrayerActionType `json:"actionType"`
	CreatedAt   time.Time        `json:"createdAt"`
}

// PrayerActionRules diz quais orações cada tradição pode registrar e qual vale
// quando o cliente não escolhe. Vive no service e viaja até o repositório para
// que a reação seja resolvida num único statement, sem ler o usuário antes.
type PrayerActionRules struct {
	Catholic           []PrayerActionType
	Evangelical        []PrayerActionType
	CatholicDefault    PrayerActionType
	EvangelicalDefault PrayerActionType
}

// ReactionInput é a entrada comum das reações em pedidos e em versículos
// compartilhados. ActionType vazio assume o padrão da tradição do usuário.
type ReactionInput struct {
	UserID      string
	SubjectID   string
	ActionType  PrayerActionType
	WindowHours int
	Rules       PrayerActionRules
}

// PrayerRequestAccess é o mínimo de um pedido visível ao viewer, para checar
// autoria sem pagar a leitura completa e o enrich de GetPrayerRequestByID.
type PrayerRequestAccess struct {
	AuthorID       string
	AllowAnonymous bool
}

// MyPrayerEntry — pedido + reação do próprio usuário, pra aba "Rezadas (privado)"
// no perfil. AuthorDisplayName e AuthorUsername são do autor do pedido.
type MyPrayerEntry struct {
	RequestID         string           `json:"requestId"`
	RequestTitle      string           `json:"requestTitle"`
	AuthorID          string           `json:"authorId"`
	AuthorUsername    string           `json:"authorUsername"`
	AuthorDisplayName string           `json:"authorDisplayName"`
	ActionType        PrayerActionType `json:"actionType"`
	CreatedAt         time.Time        `json:"createdAt"`
}

type PrayerRequestUpdate struct {
	ID              string    `json:"id"`
	PrayerRequestID string    `json:"prayerRequestId"`
	AuthorID        string    `json:"authorId"`
	AuthorUsername  string    `json:"authorUsername,omitempty"`
	AuthorDisplayName string  `json:"authorDisplayName,omitempty"`
	Body            string    `json:"body"`
	CreatedAt       time.Time `json:"createdAt"`
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
	// Preenchido só por SearchUsersForFriendship, pra UI renderizar o vínculo
	// existente em vez de esconder o usuário. Vazio (omitido) em payloads que
	// não calculam isso, como UserSuggestion.
	FriendshipStatus PublicFriendshipState `json:"friendshipStatus,omitempty"`
}

type UserSuggestion struct {
	UserSummary
	MutualFriends int    `json:"mutualFriends"`
	SharedGroups  int    `json:"sharedGroups"`
	Reason        string `json:"reason"`
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
	NotificationTypeGroupAnnouncementPosted NotificationType = "GROUP_ANNOUNCEMENT_POSTED"
	NotificationTypeRequestUpdated          NotificationType = "REQUEST_UPDATED"
	NotificationTypeRequestAnswered         NotificationType = "REQUEST_ANSWERED"
	NotificationTypeMilestonePrayed         NotificationType = "MILESTONE_PRAYED"
	NotificationTypeMilestoneCreated        NotificationType = "MILESTONE_CREATED"
	NotificationTypeMilestoneStreak         NotificationType = "MILESTONE_STREAK"
	NotificationTypeVerseSharePrayed        NotificationType = "VERSE_SHARE_PRAYED"
)


type NotificationSubjectType string

const (
	NotificationSubjectPrayerRequest NotificationSubjectType = "PRAYER_REQUEST"
	NotificationSubjectMilestone     NotificationSubjectType = "MILESTONE"
	NotificationSubjectFriendship    NotificationSubjectType = "FRIENDSHIP"
	NotificationSubjectGroup         NotificationSubjectType = "GROUP"
	NotificationSubjectVerseShare    NotificationSubjectType = "VERSE_SHARE"
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

type GroupAnnouncement struct {
	ID                string    `json:"id"`
	GroupID           string    `json:"groupId"`
	GroupName         string    `json:"groupName,omitempty"`
	AuthorID          string    `json:"authorId"`
	AuthorUsername    string    `json:"authorUsername,omitempty"`
	AuthorDisplayName string    `json:"authorDisplayName,omitempty"`
	AuthorAvatarURL   *string   `json:"authorAvatarUrl,omitempty"`
	Title             string    `json:"title"`
	Body              string    `json:"body"`
	EventAt           time.Time `json:"eventAt"`
	ImageURL          *string   `json:"imageUrl,omitempty"`
	CreatedAt         time.Time `json:"createdAt"`
	UpdatedAt         time.Time `json:"updatedAt"`
}

type CreateAnnouncementInput struct {
	GroupID  string
	AuthorID string
	Title    string
	Body     string
	EventAt  time.Time
	ImageURL *string
}

type UpdateAnnouncementInput struct {
	Title    *string
	Body     *string
	EventAt  *time.Time
	ImageURL *string
}

type FeedItemKind string

const (
	FeedItemKindPrayerRequest FeedItemKind = "PRAYER_REQUEST"
	FeedItemKindAnnouncement  FeedItemKind = "ANNOUNCEMENT"
	FeedItemKindVerseShare    FeedItemKind = "VERSE_SHARE"
)

type FeedItem struct {
	Kind          FeedItemKind       `json:"kind"`
	CreatedAt     time.Time          `json:"createdAt"`
	PrayerRequest *PrayerRequest     `json:"prayerRequest,omitempty"`
	Announcement  *GroupAnnouncement `json:"announcement,omitempty"`
	VerseShare    *VerseShare        `json:"verseShare,omitempty"`
}

func WrapPrayerRequests(items []PrayerRequest) []FeedItem {
	out := make([]FeedItem, 0, len(items))
	for i := range items {
		pr := items[i]
		out = append(out, FeedItem{
			Kind:          FeedItemKindPrayerRequest,
			CreatedAt:     pr.CreatedAt,
			PrayerRequest: &pr,
		})
	}
	return out
}

func WrapAnnouncements(items []GroupAnnouncement) []FeedItem {
	out := make([]FeedItem, 0, len(items))
	for i := range items {
		a := items[i]
		out = append(out, FeedItem{
			Kind:         FeedItemKindAnnouncement,
			CreatedAt:    a.CreatedAt,
			Announcement: &a,
		})
	}
	return out
}

// BibleVerse é uma entrada do catálogo curado que alimenta o versículo do dia.
type BibleVerse struct {
	ID          string     `json:"id"`
	BookSlug    string     `json:"bookSlug"`
	BookName    string     `json:"bookName"`
	Chapter     int        `json:"chapter"`
	Verse       int        `json:"verse"`
	Theme       VerseTheme `json:"theme"`
	Tradition   *Tradition `json:"tradition,omitempty"`
	Translation string     `json:"translation"`
	// Text fica vazio quando o catálogo ainda não foi hidratado e a API de
	// texto está indisponível. O frontend exibe só a referência nesse caso.
	Text      string `json:"text"`
	Reference string `json:"reference"`
}

// FillReference deriva a referência de exibição em pt-BR ("João 3,16").
// O separador é vírgula, como é praxe em citação bíblica em português.
func (v *BibleVerse) FillReference() {
	v.Reference = fmt.Sprintf("%s %d,%d", v.BookName, v.Chapter, v.Verse)
}

// DailyVerse é o versículo do dia de um usuário específico.
type DailyVerse struct {
	Verse BibleVerse `json:"verse"`
	// Date é o dia (YYYY-MM-DD) no fuso de São Paulo que gerou a escolha.
	Date string `json:"date"`
	// AlreadyShared diz se o usuário já compartilhou este versículo hoje —
	// o frontend usa para trocar o CTA por um link ao compartilhamento.
	AlreadyShared bool `json:"alreadyShared"`
}

// VerseShare é um versículo compartilhado no feed com o comentário do autor.
type VerseShare struct {
	ID                string               `json:"id"`
	AuthorID          string               `json:"authorId"`
	AuthorUsername    string               `json:"authorUsername,omitempty"`
	AuthorDisplayName string               `json:"authorDisplayName,omitempty"`
	AuthorAvatarURL   *string              `json:"authorAvatarUrl,omitempty"`
	Verse             BibleVerse           `json:"verse"`
	Comment           string               `json:"comment"`
	Visibility        VerseShareVisibility `json:"visibility"`
	Tradition         Tradition            `json:"tradition"`
	GroupIDs          []string             `json:"groupIds,omitempty"`
	GroupNames        []string             `json:"groupNames,omitempty"`
	PrayedCount       int64                `json:"prayedCount"`
	PrayerTypeCounts  map[string]int64     `json:"prayerTypeCounts,omitempty"`
	MyPrayerTypes     []string             `json:"myPrayerTypes,omitempty"`
	CreatedAt         time.Time            `json:"createdAt"`
	UpdatedAt         time.Time            `json:"updatedAt"`
}

// CreateVerseShareInput é a entrada de criação de um compartilhamento.
// GroupIDs só é aceito quando Visibility é GROUP_ONLY.
type CreateVerseShareInput struct {
	AuthorID   string
	VerseID    string
	Comment    string
	Visibility VerseShareVisibility
	GroupIDs   []string
}

// IsValidVerseShareVisibility valida o enum vindo do cliente.
func IsValidVerseShareVisibility(value VerseShareVisibility) bool {
	switch value {
	case VerseVisibilityPublic, VerseVisibilityFriends, VerseVisibilityGroupOnly, VerseVisibilityPrivate:
		return true
	default:
		return false
	}
}

// WrapVerseShares embrulha compartilhamentos como itens de feed.
func WrapVerseShares(items []VerseShare) []FeedItem {
	out := make([]FeedItem, 0, len(items))
	for i := range items {
		vs := items[i]
		out = append(out, FeedItem{
			Kind:       FeedItemKindVerseShare,
			CreatedAt:  vs.CreatedAt,
			VerseShare: &vs,
		})
	}
	return out
}
