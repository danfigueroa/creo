package services

import (
	"context"
	"errors"
	"hash/fnv"
	"io"
	"log"
	"regexp"
	"slices"
	"sort"
	"strings"
	"sync"
	"time"

	"parish-viva/backend/internal/bible"
	"parish-viva/backend/internal/models"
	"parish-viva/backend/internal/repositories"

	"golang.org/x/sync/errgroup"
)

type Service struct {
	repo       repositories.Repository
	bible      bible.TextProvider
	feedCounts *ttlCounts
	syncedAuth *ttlSeen
}

// feedCountTTL limita a frequência dos COUNT(*) de feed, que reexecutam a CTE
// inteira do feed só para preencher pagination.total. O total pode ficar até
// 30s defasado — aceitável, ele só alimenta o pager.
const feedCountTTL = 30 * time.Second

type ttlCountEntry struct {
	value     int64
	expiresAt time.Time
}

type ttlCounts struct {
	mu      sync.Mutex
	entries map[string]ttlCountEntry
}

// authSyncTTL é por quanto tempo um usuário já sincronizado é considerado
// sincronizado. O upsert de ensureAuthUser roda hoje em toda requisição
// autenticada, mas só faz trabalho de verdade no primeiro acesso.
const authSyncTTL = 60 * time.Second

// ttlSeen é um conjunto com expiração: responde "já vi essa chave há pouco?".
type ttlSeen struct {
	mu      sync.Mutex
	entries map[string]time.Time
}

// seen marca a chave e devolve se ela já havia sido marcada e ainda está no
// prazo. A limpeza é oportunista, no mesmo espírito do cachedCount.
func (t *ttlSeen) seen(key string, ttl time.Duration) bool {
	now := time.Now()
	t.mu.Lock()
	defer t.mu.Unlock()
	if expiresAt, ok := t.entries[key]; ok && now.Before(expiresAt) {
		return true
	}
	if len(t.entries) > 4096 {
		for k, expiresAt := range t.entries {
			if !now.Before(expiresAt) {
				delete(t.entries, k)
			}
		}
	}
	t.entries[key] = now.Add(ttl)
	return false
}

func (t *ttlSeen) forget(key string) {
	t.mu.Lock()
	delete(t.entries, key)
	t.mu.Unlock()
}

func (s *Service) cachedCount(ctx context.Context, key string, fetch func(context.Context) (int64, error)) (int64, error) {
	now := time.Now()
	s.feedCounts.mu.Lock()
	if e, ok := s.feedCounts.entries[key]; ok && now.Before(e.expiresAt) {
		s.feedCounts.mu.Unlock()
		return e.value, nil
	}
	s.feedCounts.mu.Unlock()

	value, err := fetch(ctx)
	if err != nil {
		return 0, err
	}

	s.feedCounts.mu.Lock()
	if len(s.feedCounts.entries) > 4096 {
		for k, e := range s.feedCounts.entries {
			if now.After(e.expiresAt) {
				delete(s.feedCounts.entries, k)
			}
		}
	}
	s.feedCounts.entries[key] = ttlCountEntry{value: value, expiresAt: now.Add(feedCountTTL)}
	s.feedCounts.mu.Unlock()
	return value, nil
}

var ErrInvalidDisplayName = errors.New("invalid displayName")
var ErrInvalidCategory = errors.New("invalid category")
var ErrInvalidVisibility = errors.New("invalid visibility")
var ErrInvalidTitle = errors.New("invalid title")
var ErrInvalidBody = errors.New("invalid body")
var ErrGroupIDsRequired = errors.New("groupIds required for GROUP_ONLY")
var ErrPrivateCannotHaveGroups = errors.New("PRIVATE requests cannot include groupIds")
var ErrInvalidGroupName = errors.New("invalid group name")
var ErrInvalidGroupDescription = errors.New("invalid group description")
var ErrInvalidJoinPolicy = errors.New("invalid joinPolicy")
var ErrInvalidUsername = errors.New("invalid username")
var ErrInvalidPrayerActionType = errors.New("invalid prayer action type")
var ErrInvalidTradition = errors.New("invalid tradition")
var ErrInvalidLanguage = errors.New("invalid language")
var ErrPermissionDenied = errors.New("permission denied")
var ErrLastAdmin = errors.New("cannot remove the last admin")
var ErrCannotTargetSelf = errors.New("cannot target self for this action")
var ErrInvalidGroupRole = errors.New("invalid group role")
var ErrInvalidBio = errors.New("invalid bio")
var ErrInvalidModerationAction = errors.New("invalid moderation action")
var ErrModerationReasonRequired = errors.New("moderation reason required")
var ErrAnnouncementInvalidTitle = errors.New("invalid announcement title")
var ErrAnnouncementInvalidBody = errors.New("invalid announcement body")
var ErrAnnouncementInvalidEventAt = errors.New("invalid announcement event date")

// NewService monta o service. O TextProvider pode ser nil: nesse caso o
// versículo do dia é servido só com a referência quando o catálogo ainda não
// tiver texto persistido, sem nunca falhar a requisição.
func NewService(repo repositories.Repository, bibleProvider bible.TextProvider) *Service {
	return &Service{
		repo:       repo,
		bible:      bibleProvider,
		feedCounts: &ttlCounts{entries: map[string]ttlCountEntry{}},
		syncedAuth: &ttlSeen{entries: map[string]time.Time{}},
	}
}

func (s *Service) GetProfile(ctx context.Context, userID string) (models.User, error) {
	return s.repo.GetUserByID(ctx, userID)
}

func (s *Service) UpdateProfile(ctx context.Context, userID, displayName, username string, avatarURL *string, setAvatar bool, bio *string, setBio bool) (models.User, error) {
	displayName = strings.TrimSpace(displayName)
	username = normalizeUsername(username)
	if displayName == "" {
		current, err := s.repo.GetUserByID(ctx, userID)
		if err == nil {
			displayName = current.DisplayName
		}
	}
	if len(displayName) < 2 || len(displayName) > 80 {
		return models.User{}, ErrInvalidDisplayName
	}
	if len(username) < 3 || len(username) > 30 {
		return models.User{}, ErrInvalidUsername
	}
	matched, _ := regexp.MatchString(`^[a-z0-9_]+$`, username)
	if !matched {
		return models.User{}, ErrInvalidUsername
	}
	if setBio && bio != nil {
		trimmed := strings.TrimSpace(*bio)
		if len([]rune(trimmed)) > 280 {
			return models.User{}, ErrInvalidBio
		}
		if trimmed == "" {
			bio = nil
		} else {
			bio = &trimmed
		}
	}
	return s.repo.UpdateUserProfile(ctx, userID, displayName, username, avatarURL, setAvatar, bio, setBio)
}

func (s *Service) GetPublicProfile(ctx context.Context, viewerID, username string) (models.PublicProfile, error) {
	username = normalizeUsername(username)
	if username == "" {
		return models.PublicProfile{}, repositories.ErrUserNotFound
	}
	owner, err := s.repo.GetUserByUsername(ctx, username)
	if err != nil {
		return models.PublicProfile{}, err
	}
	if viewerID != "" && owner.ID != viewerID {
		dir, err := s.repo.BlockDirection(ctx, viewerID, owner.ID)
		if err != nil {
			return models.PublicProfile{}, err
		}
		switch dir {
		case "BY_ME":
			return models.PublicProfile{
				User:             owner,
				FriendshipStatus: models.PublicFriendshipBlockedByMe,
			}, nil
		case "BY_THEM":
			return models.PublicProfile{
				User:             owner,
				FriendshipStatus: models.PublicFriendshipBlockedByThem,
			}, nil
		}
	}
	state, incomingID, outgoingID, err := s.repo.GetFriendshipState(ctx, viewerID, owner.ID)
	if err != nil {
		return models.PublicProfile{}, err
	}
	profile := models.PublicProfile{
		User:                owner,
		FriendshipStatus:    state,
		IncomingFriendReqID: incomingID,
		OutgoingFriendReqID: outgoingID,
	}
	if state == models.PublicFriendshipSelf || state == models.PublicFriendshipFriend {
		stats, err := s.repo.GetUserStats(ctx, owner.ID)
		if err != nil {
			return models.PublicProfile{}, err
		}
		profile.Stats = &stats
	}
	return profile, nil
}

func (s *Service) IsUsernameAvailable(ctx context.Context, username string) (bool, error) {
	username = normalizeUsername(username)
	if len(username) < 3 || len(username) > 30 {
		return false, ErrInvalidUsername
	}
	matched, _ := regexp.MatchString(`^[a-z0-9_]+$`, username)
	if !matched {
		return false, ErrInvalidUsername
	}
	exists, err := s.repo.UsernameExists(ctx, username)
	if err != nil {
		return false, err
	}
	return !exists, nil
}

func (s *Service) CreatePrayerRequest(ctx context.Context, in models.CreatePrayerRequestInput) (models.PrayerRequest, error) {
	in.Title = strings.TrimSpace(in.Title)
	in.Body = strings.TrimSpace(in.Body)
	if len(in.Title) < 3 || len(in.Title) > 120 {
		return models.PrayerRequest{}, ErrInvalidTitle
	}
	if len(in.Body) < 10 || len(in.Body) > 4000 {
		return models.PrayerRequest{}, ErrInvalidBody
	}
	if !isValidPrayerCategory(in.Category) {
		return models.PrayerRequest{}, ErrInvalidCategory
	}
	if !isValidVisibility(in.Visibility) {
		return models.PrayerRequest{}, ErrInvalidVisibility
	}
	if in.Visibility == models.VisibilityGroupOnly && len(in.GroupIDs) == 0 {
		return models.PrayerRequest{}, ErrGroupIDsRequired
	}
	if in.Visibility == models.VisibilityPrivate && len(in.GroupIDs) > 0 {
		return models.PrayerRequest{}, ErrPrivateCannotHaveGroups
	}
	return s.repo.CreatePrayerRequest(ctx, in)
}

func (s *Service) UpdatePrayerRequest(ctx context.Context, in models.UpdatePrayerRequestInput) (models.PrayerRequest, error) {
	in.Title = strings.TrimSpace(in.Title)
	in.Body = strings.TrimSpace(in.Body)
	if len(in.Title) < 3 || len(in.Title) > 120 {
		return models.PrayerRequest{}, ErrInvalidTitle
	}
	if len(in.Body) < 10 || len(in.Body) > 4000 {
		return models.PrayerRequest{}, ErrInvalidBody
	}
	if !isValidPrayerCategory(in.Category) {
		return models.PrayerRequest{}, ErrInvalidCategory
	}
	if !isValidVisibility(in.Visibility) {
		return models.PrayerRequest{}, ErrInvalidVisibility
	}
	if in.Visibility == models.VisibilityGroupOnly && len(in.GroupIDs) == 0 {
		return models.PrayerRequest{}, ErrGroupIDsRequired
	}
	if in.Visibility == models.VisibilityPrivate && len(in.GroupIDs) > 0 {
		return models.PrayerRequest{}, ErrPrivateCannotHaveGroups
	}
	return s.repo.UpdatePrayerRequest(ctx, in)
}

func (s *Service) DeletePrayerRequest(ctx context.Context, userID, requestID string) error {
	return s.repo.DeletePrayerRequest(ctx, userID, requestID)
}

func (s *Service) GetPrayerRequestByID(ctx context.Context, userID, requestID string) (models.PrayerRequest, error) {
	return s.repo.GetPrayerRequestByID(ctx, userID, requestID)
}

// prayerActionRules é a fonte única de quais orações cada tradição registra e
// de qual vale por padrão. O repositório aplica essas regras dentro do próprio
// statement da reação, contra a tradição atual do usuário no banco.
var prayerActionRules = models.PrayerActionRules{
	Catholic: []models.PrayerActionType{
		models.PrayerActionHailMary, models.PrayerActionOurFather, models.PrayerActionGloryBe,
		models.PrayerActionRosaryDecade, models.PrayerActionRosaryFull,
	},
	Evangelical: []models.PrayerActionType{
		models.PrayerActionIPrayed, models.PrayerActionIntercession, models.PrayerActionFasting,
		models.PrayerActionGratitude, models.PrayerActionCryingOut, models.PrayerActionPurpose,
	},
	CatholicDefault:    models.PrayerActionHailMary,
	EvangelicalDefault: models.PrayerActionIPrayed,
}

// newReactionInput valida o que dá para validar sem banco e monta a entrada da
// reação. Um tipo que não existe em nenhuma tradição morre aqui, sem viagem; o
// casamento tipo × tradição do usuário fica para o statement.
func newReactionInput(userID, subjectID string, actionType models.PrayerActionType, windowHours int) (models.ReactionInput, error) {
	if windowHours < 1 {
		windowHours = 12
	}
	if actionType != "" && !isKnownPrayerActionType(actionType) {
		return models.ReactionInput{}, ErrInvalidPrayerActionType
	}
	return models.ReactionInput{
		UserID:      userID,
		SubjectID:   subjectID,
		ActionType:  actionType,
		WindowHours: windowHours,
		Rules:       prayerActionRules,
	}, nil
}

func mapReactionError(err error) error {
	if errors.Is(err, repositories.ErrPrayerActionNotAllowed) {
		return ErrInvalidPrayerActionType
	}
	return err
}

// RecordPrayerAction registra uma reação num pedido visível ao usuário.
// actionType vazio assume a oração padrão da tradição dele.
func (s *Service) RecordPrayerAction(ctx context.Context, userID, requestID string, actionType models.PrayerActionType, windowHours int) error {
	in, err := newReactionInput(userID, requestID, actionType, windowHours)
	if err != nil {
		return err
	}
	return mapReactionError(s.repo.RecordPrayerAction(ctx, in))
}

// ListMyPrayers returns the authenticated user's prayer actions, newest first.
// Used by the profile "Rezadas (privado)" tab.
func (s *Service) ListMyPrayers(ctx context.Context, userID string, limit, offset int) ([]models.MyPrayerEntry, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	if offset < 0 {
		offset = 0
	}
	return s.repo.ListMyPrayers(ctx, userID, limit, offset)
}

// ListPrayerActionsByRequest returns every prayer action recorded for the
// request, with the actor's display info. Visibility is delegated to whoever
// shows the request — if the viewer can read the request body, they can see
// who prayed.
func (s *Service) ListPrayerActionsByRequest(ctx context.Context, viewerUserID, requestID string) ([]models.PrayerActionRecord, error) {
	if _, err := s.repo.GetPrayerRequestByID(ctx, viewerUserID, requestID); err != nil {
		return nil, err
	}
	return s.repo.ListPrayerActionsByRequest(ctx, requestID)
}

var ErrInvalidUpdateBody = errors.New("invalid update body")

const (
	requestUpdateMinBody = 1
	requestUpdateMaxBody = 2000
)

func (s *Service) CreatePrayerRequestUpdate(ctx context.Context, actorUserID, requestID, body string) (models.PrayerRequestUpdate, error) {
	body = strings.TrimSpace(body)
	if l := len([]rune(body)); l < requestUpdateMinBody || l > requestUpdateMaxBody {
		return models.PrayerRequestUpdate{}, ErrInvalidUpdateBody
	}
	req, err := s.repo.GetPrayerRequestByID(ctx, actorUserID, requestID)
	if err != nil {
		return models.PrayerRequestUpdate{}, err
	}
	if req.AuthorID != actorUserID {
		return models.PrayerRequestUpdate{}, ErrPermissionDenied
	}
	return s.repo.CreatePrayerRequestUpdate(ctx, requestID, actorUserID, body)
}

func (s *Service) ListPrayerRequestUpdates(ctx context.Context, viewerUserID, requestID string) ([]models.PrayerRequestUpdate, error) {
	req, err := s.repo.GetPrayerRequestByID(ctx, viewerUserID, requestID)
	if err != nil {
		return nil, err
	}
	updates, err := s.repo.ListPrayerRequestUpdates(ctx, requestID)
	if err != nil {
		return nil, err
	}
	// Mirror the request-level anonymity onto the author-published updates so
	// non-authors can't fingerprint the writer through the updates list.
	if req.AllowAnonymous && req.AuthorID != viewerUserID {
		for i := range updates {
			updates[i].AuthorUsername = ""
			updates[i].AuthorDisplayName = "Anônimo"
		}
	}
	return updates, nil
}

const requestTestimonyMaxBody = 2000

// AnswerPrayerRequest marks the request as a "grace answered" (graça
// alcançada) with an optional testimony. Only the author may do it. Everyone
// who prayed (except the author) gets a REQUEST_ANSWERED notification.
func (s *Service) AnswerPrayerRequest(ctx context.Context, in models.AnswerPrayerRequestInput) (models.PrayerRequest, error) {
	in.Testimony = strings.TrimSpace(in.Testimony)
	if len([]rune(in.Testimony)) > requestTestimonyMaxBody {
		return models.PrayerRequest{}, ErrInvalidUpdateBody
	}
	req, err := s.repo.GetPrayerRequestByID(ctx, in.ActorUserID, in.RequestID)
	if err != nil {
		return models.PrayerRequest{}, err
	}
	if req.AuthorID != in.ActorUserID {
		return models.PrayerRequest{}, ErrPermissionDenied
	}
	return s.repo.MarkPrayerRequestAnswered(ctx, in)
}

// UnanswerPrayerRequest reverts a request out of the answered state. Only the
// author may do it.
func (s *Service) UnanswerPrayerRequest(ctx context.Context, userID, requestID string) (models.PrayerRequest, error) {
	req, err := s.repo.GetPrayerRequestByID(ctx, userID, requestID)
	if err != nil {
		return models.PrayerRequest{}, err
	}
	if req.AuthorID != userID {
		return models.PrayerRequest{}, ErrPermissionDenied
	}
	return s.repo.ClearPrayerRequestAnswered(ctx, userID, requestID)
}

// GetUserStats returns ProfileStats for the given user (used by /profile/stats
// for the authenticated user; the public profile flow has its own gating).
func (s *Service) GetUserStats(ctx context.Context, userID string) (models.ProfileStats, error) {
	return s.repo.GetUserStats(ctx, userID)
}

func (s *Service) SetUserTradition(ctx context.Context, userID string, tradition models.Tradition) (models.User, error) {
	if !isValidTradition(tradition) {
		return models.User{}, ErrInvalidTradition
	}
	return s.repo.SetUserTradition(ctx, userID, tradition)
}

func (s *Service) SetUserLanguage(ctx context.Context, userID string, language models.Language) (models.User, error) {
	if !isValidLanguage(language) {
		return models.User{}, ErrInvalidLanguage
	}
	return s.repo.SetUserLanguage(ctx, userID, language)
}

// defaultPrayerActionFor é a oração assumida quando o cliente não escolhe uma.
// Pura, para poder ser usada onde o usuário já foi carregado.
func defaultPrayerActionFor(tradition models.Tradition) models.PrayerActionType {
	if tradition == models.TraditionEvangelical {
		return prayerActionRules.EvangelicalDefault
	}
	return prayerActionRules.CatholicDefault
}

func (s *Service) DefaultPrayerActionFor(ctx context.Context, userID string) models.PrayerActionType {
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return models.PrayerActionHailMary
	}
	return defaultPrayerActionFor(user.Tradition)
}

func (s *Service) ListUserGroups(ctx context.Context, userID string) ([]models.Group, error) {
	return s.repo.ListUserGroups(ctx, userID)
}

func (s *Service) SearchGroupsByName(ctx context.Context, userID, query string, limit int) ([]models.GroupSummary, error) {
	query = strings.TrimSpace(strings.TrimPrefix(query, "@"))
	if query == "" {
		return []models.GroupSummary{}, nil
	}
	return s.repo.SearchGroupsByName(ctx, userID, query, limit)
}

func (s *Service) CreateGroup(ctx context.Context, userID, name, description string, imageURL *string, joinPolicy models.GroupJoinPolicy) (models.Group, error) {
	name = strings.TrimSpace(name)
	description = strings.TrimSpace(description)
	if joinPolicy == "" {
		joinPolicy = models.JoinPolicyRequest
	}
	if len(name) < 3 || len(name) > 80 {
		return models.Group{}, ErrInvalidGroupName
	}
	if len(description) > 500 {
		return models.Group{}, ErrInvalidGroupDescription
	}
	switch joinPolicy {
	case models.JoinPolicyOpen, models.JoinPolicyRequest, models.JoinPolicyInviteOnly:
	default:
		return models.Group{}, ErrInvalidJoinPolicy
	}
	return s.repo.CreateGroup(ctx, userID, name, description, imageURL, joinPolicy)
}

func (s *Service) RequestJoinGroup(ctx context.Context, userID, groupID string) error {
	return s.repo.RequestJoinGroup(ctx, userID, groupID)
}

func (s *Service) ListGroupJoinRequests(ctx context.Context, actorUserID, groupID string) ([]models.GroupJoinRequest, error) {
	return s.repo.ListGroupJoinRequests(ctx, actorUserID, groupID)
}

func (s *Service) ApproveGroupJoinRequest(ctx context.Context, actorUserID, groupID, requestID string) error {
	return s.repo.ApproveGroupJoinRequest(ctx, actorUserID, groupID, requestID)
}

func (s *Service) RejectGroupJoinRequest(ctx context.Context, actorUserID, groupID, requestID string) error {
	return s.repo.RejectGroupJoinRequest(ctx, actorUserID, groupID, requestID)
}

func (s *Service) GetGroupDetails(ctx context.Context, viewerUserID, groupID string) (models.GroupDetails, error) {
	return s.repo.GetGroupDetails(ctx, viewerUserID, groupID)
}

func (s *Service) ListGroupMembers(ctx context.Context, viewerUserID, groupID string, limit, offset int) ([]models.GroupMember, int64, error) {
	if _, isMember, err := s.repo.GetGroupRoleOf(ctx, viewerUserID, groupID); err != nil {
		return nil, 0, err
	} else if !isMember {
		return nil, 0, ErrPermissionDenied
	}
	return s.repo.ListGroupMembers(ctx, groupID, limit, offset)
}

func (s *Service) ChangeMemberRole(ctx context.Context, actorUserID, groupID, targetUserID string, newRole models.GroupRole) error {
	if !models.IsValidGroupRole(newRole) {
		return ErrInvalidGroupRole
	}
	actorRole, isMember, err := s.repo.GetGroupRoleOf(ctx, actorUserID, groupID)
	if err != nil {
		return err
	}
	if !isMember || actorRole != models.RoleAdmin {
		return ErrPermissionDenied
	}
	targetRole, isTargetMember, err := s.repo.GetGroupRoleOf(ctx, targetUserID, groupID)
	if err != nil {
		return err
	}
	if !isTargetMember {
		return repositories.ErrGroupMembershipNotFound
	}
	if targetRole == newRole {
		return nil
	}
	// Demoting an admin: ensure at least one admin remains.
	if targetRole == models.RoleAdmin && newRole != models.RoleAdmin {
		admins, err := s.repo.CountGroupAdmins(ctx, groupID)
		if err != nil {
			return err
		}
		if admins <= 1 {
			return ErrLastAdmin
		}
	}
	return s.repo.ChangeMemberRole(ctx, groupID, targetUserID, newRole)
}

func (s *Service) RemoveGroupMember(ctx context.Context, actorUserID, groupID, targetUserID string) error {
	if actorUserID == targetUserID {
		return ErrCannotTargetSelf
	}
	actorRole, isMember, err := s.repo.GetGroupRoleOf(ctx, actorUserID, groupID)
	if err != nil {
		return err
	}
	if !isMember {
		return ErrPermissionDenied
	}
	targetRole, isTargetMember, err := s.repo.GetGroupRoleOf(ctx, targetUserID, groupID)
	if err != nil {
		return err
	}
	if !isTargetMember {
		return repositories.ErrGroupMembershipNotFound
	}
	// Actor must outrank target. Moderator can remove member; admin can remove anyone.
	if models.RoleRank(actorRole) <= models.RoleRank(targetRole) {
		return ErrPermissionDenied
	}
	if targetRole == models.RoleAdmin {
		admins, err := s.repo.CountGroupAdmins(ctx, groupID)
		if err != nil {
			return err
		}
		if admins <= 1 {
			return ErrLastAdmin
		}
	}
	return s.repo.RemoveMember(ctx, groupID, targetUserID)
}

func (s *Service) LeaveGroup(ctx context.Context, userID, groupID string) error {
	role, isMember, err := s.repo.GetGroupRoleOf(ctx, userID, groupID)
	if err != nil {
		return err
	}
	if !isMember {
		return repositories.ErrGroupMembershipNotFound
	}
	if role == models.RoleAdmin {
		admins, err := s.repo.CountGroupAdmins(ctx, groupID)
		if err != nil {
			return err
		}
		if admins <= 1 {
			return ErrLastAdmin
		}
	}
	return s.repo.RemoveMember(ctx, groupID, userID)
}

func (s *Service) UpdateGroup(ctx context.Context, actorUserID, groupID string, in models.UpdateGroupInput) (models.Group, error) {
	actorRole, isMember, err := s.repo.GetGroupRoleOf(ctx, actorUserID, groupID)
	if err != nil {
		return models.Group{}, err
	}
	if !isMember || actorRole != models.RoleAdmin {
		return models.Group{}, ErrPermissionDenied
	}
	if in.Name != nil {
		trimmed := strings.TrimSpace(*in.Name)
		if len(trimmed) < 3 || len(trimmed) > 80 {
			return models.Group{}, ErrInvalidGroupName
		}
		in.Name = &trimmed
	}
	if in.Description != nil {
		trimmed := strings.TrimSpace(*in.Description)
		if len(trimmed) > 500 {
			return models.Group{}, ErrInvalidGroupDescription
		}
		in.Description = &trimmed
	}
	if in.JoinPolicy != nil {
		switch *in.JoinPolicy {
		case models.JoinPolicyOpen, models.JoinPolicyRequest, models.JoinPolicyInviteOnly:
		default:
			return models.Group{}, ErrInvalidJoinPolicy
		}
	}
	return s.repo.UpdateGroup(ctx, groupID, in)
}

func (s *Service) ensureGroupFeedAccess(ctx context.Context, viewerUserID, groupID string) error {
	details, err := s.repo.GetGroupDetails(ctx, viewerUserID, groupID)
	if err != nil {
		return err
	}
	if details.JoinPolicy == models.JoinPolicyInviteOnly && !details.IsMember {
		return ErrPermissionDenied
	}
	return nil
}

func (s *Service) SendFriendRequest(ctx context.Context, fromUserID, targetUsername string) error {
	targetUsername = strings.TrimSpace(strings.TrimPrefix(strings.ToLower(targetUsername), "@"))
	if len(targetUsername) < 3 {
		return ErrInvalidUsername
	}
	return s.repo.SendFriendRequest(ctx, fromUserID, targetUsername)
}

func (s *Service) ListFriends(ctx context.Context, userID string) ([]models.Friend, error) {
	return s.repo.ListFriends(ctx, userID)
}

func (s *Service) ListPendingFriendRequests(ctx context.Context, userID string) ([]models.FriendRequest, error) {
	return s.repo.ListPendingFriendRequests(ctx, userID)
}

func (s *Service) AcceptFriendRequest(ctx context.Context, userID, requestID string) error {
	return s.repo.AcceptFriendRequest(ctx, userID, requestID)
}

func (s *Service) RejectFriendRequest(ctx context.Context, userID, requestID string) error {
	return s.repo.RejectFriendRequest(ctx, userID, requestID)
}

func (s *Service) CancelFriendRequest(ctx context.Context, userID, requestID string) error {
	return s.repo.CancelFriendRequest(ctx, userID, requestID)
}

func (s *Service) RemoveFriendship(ctx context.Context, userID, targetUserID string) error {
	if userID == targetUserID {
		return ErrCannotTargetSelf
	}
	return s.repo.RemoveFriendship(ctx, userID, targetUserID)
}

func (s *Service) BlockUser(ctx context.Context, blockerID, targetUsername string) (models.BlockedUser, error) {
	targetUsername = normalizeUsername(targetUsername)
	if len(targetUsername) < 3 {
		return models.BlockedUser{}, ErrInvalidUsername
	}
	return s.repo.BlockUser(ctx, blockerID, targetUsername)
}

func (s *Service) UnblockUser(ctx context.Context, blockerID, blockedUserID string) error {
	return s.repo.UnblockUser(ctx, blockerID, blockedUserID)
}

func (s *Service) ListBlockedUsers(ctx context.Context, blockerID string) ([]models.BlockedUser, error) {
	return s.repo.ListBlockedUsers(ctx, blockerID)
}

// SuggestFriends returns up to 10 users with relevance signal (mutual friends
// or shared groups) for the given viewer. Used by the onboarding wizard and
// can also feed any "pessoas para conhecer" surface.
func (s *Service) SuggestFriends(ctx context.Context, userID string, limit int) ([]models.UserSuggestion, error) {
	if limit <= 0 || limit > 50 {
		limit = 10
	}
	return s.repo.SuggestFriends(ctx, userID, limit)
}

func (s *Service) SearchUsersForFriendship(ctx context.Context, userID, query string, limit int) ([]models.UserSummary, error) {
	query = strings.TrimSpace(strings.TrimPrefix(strings.ToLower(query), "@"))
	if query == "" {
		return []models.UserSummary{}, nil
	}
	return s.repo.SearchUsersForFriendship(ctx, userID, query, limit)
}

func (s *Service) EnsureAuthUser(ctx context.Context, userID, email, preferredUsername, preferredDisplayName, preferredTradition string) error {
	if strings.TrimSpace(email) == "" && strings.TrimSpace(userID) != "" {
		email = userID + "@auth.local"
	}
	preferredUsername = normalizeUsername(preferredUsername)
	preferredDisplayName = strings.TrimSpace(preferredDisplayName)
	preferredTradition = strings.ToUpper(strings.TrimSpace(preferredTradition))

	// A chave carrega os dados do token, não só o id: se qualquer um deles
	// mudar no Supabase, a sincronia acontece na hora em vez de esperar o TTL.
	// Sem isso, o upsert custaria uma ida ao banco em toda requisição
	// autenticada, antes mesmo de o handler começar o trabalho de verdade.
	key := strings.Join([]string{userID, email, preferredUsername, preferredDisplayName, preferredTradition}, "|")
	if s.syncedAuth.seen(key, authSyncTTL) {
		return nil
	}
	if err := s.repo.UpsertAuthUser(ctx, userID, email, preferredUsername, preferredDisplayName, preferredTradition); err != nil {
		// Falhou: não deixa a marca no cache esconder o erro da próxima vez.
		s.syncedAuth.forget(key)
		return err
	}
	return nil
}

func normalizeUsername(value string) string {
	return strings.TrimSpace(strings.TrimPrefix(strings.ToLower(value), "@"))
}

func isValidPrayerCategory(category models.PrayerCategory) bool {
	switch category {
	case models.CategoryHealth, models.CategoryFamily, models.CategoryWork, models.CategoryGrief, models.CategoryThanksgiving, models.CategoryOther:
		return true
	default:
		return false
	}
}

func isValidVisibility(visibility models.Visibility) bool {
	switch visibility {
	case models.VisibilityPublic, models.VisibilityGroupOnly, models.VisibilityPrivate:
		return true
	default:
		return false
	}
}

// isKnownPrayerActionType diz se o tipo existe em alguma tradição.
func isKnownPrayerActionType(actionType models.PrayerActionType) bool {
	return slices.Contains(prayerActionRules.Catholic, actionType) ||
		slices.Contains(prayerActionRules.Evangelical, actionType)
}

func isValidTradition(tradition models.Tradition) bool {
	switch tradition {
	case models.TraditionCatholic, models.TraditionEvangelical:
		return true
	default:
		return false
	}
}

func isValidLanguage(language models.Language) bool {
	switch language {
	case models.LanguagePtBr, models.LanguageEn, models.LanguageEs:
		return true
	default:
		return false
	}
}

// announcementEventAtBounds keeps event_at sane: not absurdly old, not absurdly far in the future.
const (
	announcementMinPastYears   = 5
	announcementMaxFutureYears = 10
)

func (s *Service) validateAnnouncementFields(title, body string, eventAt time.Time) (string, string, error) {
	title = strings.TrimSpace(title)
	body = strings.TrimSpace(body)
	if l := len([]rune(title)); l < 3 || l > 120 {
		return "", "", ErrAnnouncementInvalidTitle
	}
	if l := len([]rune(body)); l < 10 || l > 2000 {
		return "", "", ErrAnnouncementInvalidBody
	}
	if eventAt.IsZero() {
		return "", "", ErrAnnouncementInvalidEventAt
	}
	now := time.Now()
	if eventAt.Before(now.AddDate(-announcementMinPastYears, 0, 0)) || eventAt.After(now.AddDate(announcementMaxFutureYears, 0, 0)) {
		return "", "", ErrAnnouncementInvalidEventAt
	}
	return title, body, nil
}

func (s *Service) requireGroupRoleAtLeast(ctx context.Context, userID, groupID string, minRole models.GroupRole) error {
	role, isMember, err := s.repo.GetGroupRoleOf(ctx, userID, groupID)
	if err != nil {
		return err
	}
	if !isMember {
		return ErrPermissionDenied
	}
	if models.RoleRank(role) < models.RoleRank(minRole) {
		return ErrPermissionDenied
	}
	return nil
}

func (s *Service) CreateAnnouncement(ctx context.Context, actorUserID, groupID, title, body string, eventAt time.Time, imageURL *string) (models.GroupAnnouncement, error) {
	if err := s.requireGroupRoleAtLeast(ctx, actorUserID, groupID, models.RoleModerator); err != nil {
		return models.GroupAnnouncement{}, err
	}
	cleanTitle, cleanBody, err := s.validateAnnouncementFields(title, body, eventAt)
	if err != nil {
		return models.GroupAnnouncement{}, err
	}
	if imageURL != nil {
		trimmed := strings.TrimSpace(*imageURL)
		if trimmed == "" {
			imageURL = nil
		} else {
			imageURL = &trimmed
		}
	}
	return s.repo.CreateAnnouncement(ctx, models.CreateAnnouncementInput{
		GroupID:  groupID,
		AuthorID: actorUserID,
		Title:    cleanTitle,
		Body:     cleanBody,
		EventAt:  eventAt,
		ImageURL: imageURL,
	})
}

// canManageAnnouncement returns nil if the actor can edit/delete the given announcement.
// Author can always; admin/moderator of the group can; everyone else is forbidden.
func (s *Service) canManageAnnouncement(ctx context.Context, actorUserID string, announcement models.GroupAnnouncement) error {
	if announcement.AuthorID == actorUserID {
		return nil
	}
	role, isMember, err := s.repo.GetGroupRoleOf(ctx, actorUserID, announcement.GroupID)
	if err != nil {
		return err
	}
	if !isMember {
		return ErrPermissionDenied
	}
	if models.RoleRank(role) < models.RoleRank(models.RoleModerator) {
		return ErrPermissionDenied
	}
	return nil
}

func (s *Service) UpdateAnnouncement(ctx context.Context, actorUserID, announcementID string, in models.UpdateAnnouncementInput) (models.GroupAnnouncement, error) {
	existing, err := s.repo.GetAnnouncementByID(ctx, announcementID)
	if err != nil {
		return models.GroupAnnouncement{}, err
	}
	if err := s.canManageAnnouncement(ctx, actorUserID, existing); err != nil {
		return models.GroupAnnouncement{}, err
	}
	// Validate the would-be final values: any unchanged field falls back to existing.
	finalTitle := existing.Title
	if in.Title != nil {
		finalTitle = *in.Title
	}
	finalBody := existing.Body
	if in.Body != nil {
		finalBody = *in.Body
	}
	finalEventAt := existing.EventAt
	if in.EventAt != nil {
		finalEventAt = *in.EventAt
	}
	cleanTitle, cleanBody, err := s.validateAnnouncementFields(finalTitle, finalBody, finalEventAt)
	if err != nil {
		return models.GroupAnnouncement{}, err
	}
	if in.Title != nil {
		in.Title = &cleanTitle
	}
	if in.Body != nil {
		in.Body = &cleanBody
	}
	if in.ImageURL != nil {
		trimmed := strings.TrimSpace(*in.ImageURL)
		in.ImageURL = &trimmed
	}
	return s.repo.UpdateAnnouncement(ctx, announcementID, in)
}

func (s *Service) DeleteAnnouncement(ctx context.Context, actorUserID, announcementID string) error {
	existing, err := s.repo.GetAnnouncementByID(ctx, announcementID)
	if err != nil {
		return err
	}
	if err := s.canManageAnnouncement(ctx, actorUserID, existing); err != nil {
		return err
	}
	return s.repo.SoftDeleteAnnouncement(ctx, announcementID)
}

func (s *Service) ListAnnouncementsByGroup(ctx context.Context, viewerUserID, groupID string, limit, offset int) ([]models.GroupAnnouncement, int64, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	if err := s.ensureGroupFeedAccess(ctx, viewerUserID, groupID); err != nil {
		return nil, 0, err
	}
	items, err := s.repo.ListAnnouncementsByGroup(ctx, groupID, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	total, err := s.repo.CountAnnouncementsByGroup(ctx, groupID)
	if err != nil {
		return nil, 0, err
	}
	return items, total, nil
}

// mergeFeedItems merges two pre-sorted (created_at DESC) lists into one,
// preserving DESC order. Used to overlay announcements onto prayer-request feeds.
// Note: assumes inputs already include enough rows to satisfy the requested page
// (callers fetch limit+offset from each side and slice afterwards).
// maxParallelQueries limita quantas consultas uma única requisição dispara ao
// mesmo tempo. O pool tem teto de DB_MAX_CONNS (8) para o processo inteiro, e
// esse teto existe por causa do pooler do Supabase: sem trava, um fanout de seis
// numa requisição só já consumiria quase tudo e faria a latência piorar
// justamente sob carga, que é o oposto do objetivo.
const maxParallelQueries = 3

// runBounded roda tarefas independentes em paralelo, respeitando esse limite.
// O contexto do errgroup cancela as irmãs no primeiro erro, que é o
// comportamento certo aqui: se um stream do feed falha, a resposta falha.
func runBounded(ctx context.Context, tasks ...func(context.Context) error) error {
	group, ctx := errgroup.WithContext(ctx)
	group.SetLimit(maxParallelQueries)
	for _, task := range tasks {
		group.Go(func() error { return task(ctx) })
	}
	return group.Wait()
}

// mergeFeedItems intercala N streams de feed por created_at decrescente.
// É variádico porque o feed passou a ter três tipos de item (pedidos, avisos e
// compartilhamentos de versículo) e tende a ganhar mais.
func mergeFeedItems(streams ...[]models.FeedItem) []models.FeedItem {
	total := 0
	for _, stream := range streams {
		total += len(stream)
	}
	out := make([]models.FeedItem, 0, total)
	for _, stream := range streams {
		out = append(out, stream...)
	}
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})
	return out
}

func sliceFeed(items []models.FeedItem, offset, limit int) []models.FeedItem {
	if offset >= len(items) {
		return []models.FeedItem{}
	}
	end := offset + limit
	if end > len(items) {
		end = len(items)
	}
	return items[offset:end]
}

// enrichFeedPage enriquece (autor, grupos, contagens de reação) apenas os pedidos
// presentes na página final — os List* dos feeds mesclados retornam linhas cruas.
func (s *Service) enrichFeedPage(ctx context.Context, viewerUserID string, page []models.FeedItem) error {
	prayers := make([]*models.PrayerRequest, 0, len(page))
	verses := make([]*models.VerseShare, 0, len(page))
	for i := range page {
		if page[i].PrayerRequest != nil {
			prayers = append(prayers, page[i].PrayerRequest)
		}
		if page[i].VerseShare != nil {
			verses = append(verses, page[i].VerseShare)
		}
	}
	// Cada enriquecimento é um batch de uma viagem só, e eles não se cruzam:
	// atuam sobre fatias disjuntas da página.
	return runBounded(ctx,
		func(ctx context.Context) error { return s.repo.EnrichPrayerRequests(ctx, viewerUserID, prayers) },
		func(ctx context.Context) error { return s.repo.EnrichVerseShares(ctx, viewerUserID, verses) },
	)
}

// ListGroupFeed returns the merged feed (prayer requests + announcements) for a group's mural.
// Pagination strategy: fetch limit+offset from each stream, merge, slice. OK for small offsets.
func (s *Service) ListGroupFeed(ctx context.Context, viewerUserID, groupID string, limit, offset int) ([]models.FeedItem, int64, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	if err := s.ensureGroupFeedAccess(ctx, viewerUserID, groupID); err != nil {
		return nil, 0, err
	}
	fetch := limit + offset

	var (
		prayers           []models.PrayerRequest
		announcements     []models.GroupAnnouncement
		verses            []models.VerseShare
		prayerCount       int64
		announcementCount int64
		verseCount        int64
	)
	// ensureGroupFeedAccess já rodou acima: é porta de autorização e continua
	// sequencial de propósito, para nada ser lido antes de o acesso ser aceito.
	if err := runBounded(ctx,
		func(ctx context.Context) (err error) {
			prayers, err = s.repo.ListPrayerRequestsByGroup(ctx, viewerUserID, groupID, fetch, 0)
			return
		},
		func(ctx context.Context) (err error) {
			announcements, err = s.repo.ListAnnouncementsByGroup(ctx, groupID, fetch, 0)
			return
		},
		func(ctx context.Context) (err error) {
			verses, err = s.repo.ListVerseSharesByGroup(ctx, viewerUserID, groupID, fetch, 0)
			return
		},
		func(ctx context.Context) (err error) {
			prayerCount, err = s.cachedCount(ctx, "group-req:"+groupID+":"+viewerUserID, func(ctx context.Context) (int64, error) {
				return s.repo.CountPrayerRequestsByGroup(ctx, viewerUserID, groupID)
			})
			return
		},
		func(ctx context.Context) (err error) {
			announcementCount, err = s.cachedCount(ctx, "group-ann:"+groupID, func(ctx context.Context) (int64, error) {
				return s.repo.CountAnnouncementsByGroup(ctx, groupID)
			})
			return
		},
		func(ctx context.Context) (err error) {
			verseCount, err = s.cachedCount(ctx, "group-verse:"+groupID+":"+viewerUserID, func(ctx context.Context) (int64, error) {
				return s.repo.CountVerseSharesByGroup(ctx, viewerUserID, groupID)
			})
			return
		},
	); err != nil {
		return nil, 0, err
	}

	merged := mergeFeedItems(
		models.WrapPrayerRequests(prayers),
		models.WrapAnnouncements(announcements),
		models.WrapVerseShares(verses),
	)
	page := sliceFeed(merged, offset, limit)
	if err := s.enrichFeedPage(ctx, viewerUserID, page); err != nil {
		return nil, 0, err
	}
	return page, prayerCount + announcementCount + verseCount, nil
}

// ListHomeFeed returns the merged home feed (prayer requests from self/friends/groups + announcements
// from groups the user belongs to).
func (s *Service) ListHomeFeed(ctx context.Context, userID string, limit, offset int) ([]models.FeedItem, int64, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	fetch := limit + offset

	var (
		prayers           []models.PrayerRequest
		announcements     []models.GroupAnnouncement
		verses            []models.VerseShare
		prayerCount       int64
		announcementCount int64
		verseCount        int64
	)
	// Os seis são independentes entre si: cada um só depende de userID e fetch,
	// e cada tarefa escreve numa variável distinta.
	if err := runBounded(ctx,
		func(ctx context.Context) (err error) {
			prayers, err = s.repo.ListHomePrayerRequests(ctx, userID, fetch, 0)
			return
		},
		func(ctx context.Context) (err error) {
			announcements, err = s.repo.ListAnnouncementsForUser(ctx, userID, fetch, 0)
			return
		},
		func(ctx context.Context) (err error) {
			verses, err = s.repo.ListHomeVerseShares(ctx, userID, fetch, 0)
			return
		},
		func(ctx context.Context) (err error) {
			prayerCount, err = s.cachedCount(ctx, "home:"+userID, func(ctx context.Context) (int64, error) {
				return s.repo.CountHomePrayerRequests(ctx, userID)
			})
			return
		},
		func(ctx context.Context) (err error) {
			announcementCount, err = s.cachedCount(ctx, "ann-user:"+userID, func(ctx context.Context) (int64, error) {
				return s.repo.CountAnnouncementsForUser(ctx, userID)
			})
			return
		},
		func(ctx context.Context) (err error) {
			verseCount, err = s.cachedCount(ctx, "home-verse:"+userID, func(ctx context.Context) (int64, error) {
				return s.repo.CountHomeVerseShares(ctx, userID)
			})
			return
		},
	); err != nil {
		return nil, 0, err
	}

	merged := mergeFeedItems(
		models.WrapPrayerRequests(prayers),
		models.WrapAnnouncements(announcements),
		models.WrapVerseShares(verses),
	)
	page := sliceFeed(merged, offset, limit)
	if err := s.enrichFeedPage(ctx, userID, page); err != nil {
		return nil, 0, err
	}
	return page, prayerCount + announcementCount + verseCount, nil
}

// ListGroupsFeed returns the merged "all groups" feed (all prayer requests from groups
// the user belongs to + all announcements from those same groups).
func (s *Service) ListGroupsFeed(ctx context.Context, userID string, limit, offset int) ([]models.FeedItem, int64, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	fetch := limit + offset

	var (
		prayers           []models.PrayerRequest
		announcements     []models.GroupAnnouncement
		verses            []models.VerseShare
		prayerCount       int64
		announcementCount int64
		verseCount        int64
	)
	if err := runBounded(ctx,
		func(ctx context.Context) (err error) {
			prayers, err = s.repo.ListGroupsPrayerRequests(ctx, userID, fetch, 0)
			return
		},
		func(ctx context.Context) (err error) {
			announcements, err = s.repo.ListAnnouncementsForUser(ctx, userID, fetch, 0)
			return
		},
		func(ctx context.Context) (err error) {
			verses, err = s.repo.ListGroupsVerseShares(ctx, userID, fetch, 0)
			return
		},
		func(ctx context.Context) (err error) {
			prayerCount, err = s.cachedCount(ctx, "groups:"+userID, func(ctx context.Context) (int64, error) {
				return s.repo.CountGroupsPrayerRequests(ctx, userID)
			})
			return
		},
		func(ctx context.Context) (err error) {
			announcementCount, err = s.cachedCount(ctx, "ann-user:"+userID, func(ctx context.Context) (int64, error) {
				return s.repo.CountAnnouncementsForUser(ctx, userID)
			})
			return
		},
		func(ctx context.Context) (err error) {
			verseCount, err = s.cachedCount(ctx, "groups-verse:"+userID, func(ctx context.Context) (int64, error) {
				return s.repo.CountGroupsVerseShares(ctx, userID)
			})
			return
		},
	); err != nil {
		return nil, 0, err
	}

	merged := mergeFeedItems(
		models.WrapPrayerRequests(prayers),
		models.WrapAnnouncements(announcements),
		models.WrapVerseShares(verses),
	)
	page := sliceFeed(merged, offset, limit)
	if err := s.enrichFeedPage(ctx, userID, page); err != nil {
		return nil, 0, err
	}
	return page, prayerCount + announcementCount + verseCount, nil
}

func (s *Service) ListNotifications(ctx context.Context, userID string, limit, offset int) ([]models.NotificationView, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	return s.repo.ListNotifications(ctx, userID, limit, offset)
}

func (s *Service) CountUnreadNotifications(ctx context.Context, userID string) (int64, error) {
	return s.repo.CountUnreadNotifications(ctx, userID)
}

func (s *Service) MarkNotificationRead(ctx context.Context, userID, id string) error {
	return s.repo.MarkNotificationRead(ctx, userID, id)
}

func (s *Service) MarkAllNotificationsRead(ctx context.Context, userID string) error {
	return s.repo.MarkAllNotificationsRead(ctx, userID)
}

func (s *Service) ListModerationQueue(ctx context.Context, moderatorUserID string, limit, offset int) ([]models.ModerationQueueItem, error) {
	return s.repo.ListModerationQueue(ctx, moderatorUserID, limit, offset)
}

func (s *Service) ApplyModerationAction(ctx context.Context, moderatorUserID, requestID string, action models.ModerationActionType, reason string) error {
	switch action {
	case models.ActionApprove, models.ActionReject, models.ActionRequestChanges, models.ActionRemove:
	default:
		return ErrInvalidModerationAction
	}
	if action == models.ActionReject || action == models.ActionRequestChanges {
		if strings.TrimSpace(reason) == "" {
			return ErrModerationReasonRequired
		}
	}
	return s.repo.ApplyModerationAction(ctx, moderatorUserID, requestID, action, reason)
}

func (s *Service) ListModerationHistory(ctx context.Context, viewerUserID, requestID string) ([]models.ModerationActionRecord, error) {
	return s.repo.ListModerationHistory(ctx, viewerUserID, requestID)
}

// ---------------------------------------------------------------------------
// Versículo do dia
// ---------------------------------------------------------------------------

var (
	// ErrVersePoolEmpty indica catálogo vazio para a tradição do usuário —
	// na prática, migration de seed não aplicada.
	ErrVersePoolEmpty = errors.New("verse pool empty")
	// ErrInvalidVerseComment sinaliza comentário acima do limite.
	ErrInvalidVerseComment = errors.New("invalid verse comment")
	// ErrInvalidVerseVisibility sinaliza visibilidade fora do enum.
	ErrInvalidVerseVisibility = errors.New("invalid verse visibility")
	// ErrVerseGroupIDsRequired sinaliza GROUP_ONLY sem grupo alvo.
	ErrVerseGroupIDsRequired = errors.New("verse group ids required")
	// ErrVerseGroupsNotAllowed sinaliza grupos enviados numa visibilidade que não os aceita.
	ErrVerseGroupsNotAllowed = errors.New("verse groups not allowed")
)

// verseCommentMaxRunes limita o comentário do compartilhamento. Contado em
// runas, como nos avisos de grupo, para não penalizar acentuação.
const verseCommentMaxRunes = 500

// verseDayLocation é o fuso que define a virada do "dia" do versículo. O
// produto é brasileiro: virar em UTC entregaria o versículo de amanhã no fim da
// tarde. Se a tzdata não estiver disponível, cai num offset fixo de -03:00.
var verseDayLocation = func() *time.Location {
	loc, err := time.LoadLocation("America/Sao_Paulo")
	if err != nil {
		return time.FixedZone("BRT", -3*60*60)
	}
	return loc
}()

// dailyVerseOffset devolve a posição, dentro do pool, do versículo do dia de um
// usuário. É determinística por (usuário, dia): estável enquanto o dia durar e
// distinta entre usuários, sem estado persistido nem job agendado — o backend
// não tem scheduler, então a escolha precisa ser recomputável a cada request.
//
// poolSize deve ser > 0; quem chama garante isso antes.
func dailyVerseOffset(userID string, day time.Time, poolSize int64) int64 {
	h := fnv.New64a()
	_, _ = io.WriteString(h, userID)
	_, _ = io.WriteString(h, "|")
	_, _ = io.WriteString(h, day.Format("2006-01-02"))
	return int64(h.Sum64() % uint64(poolSize))
}

// GetDailyVerse devolve o versículo do dia do usuário, hidratando o texto pela
// API na primeira vez que aquele versículo é servido.
//
// Falha do provider de texto não propaga: o versículo volta com Text vazio e o
// frontend exibe só a referência. O versículo do dia nunca derruba a tela.
func (s *Service) GetDailyVerse(ctx context.Context, userID string) (models.DailyVerse, error) {
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return models.DailyVerse{}, err
	}

	poolSize, err := s.cachedCount(ctx, "verse-pool:"+string(user.Tradition), func(ctx context.Context) (int64, error) {
		return s.repo.CountVersePool(ctx, user.Tradition)
	})
	if err != nil {
		return models.DailyVerse{}, err
	}
	if poolSize <= 0 {
		return models.DailyVerse{}, ErrVersePoolEmpty
	}

	day := time.Now().In(verseDayLocation)
	offset := dailyVerseOffset(userID, day, poolSize)

	verse, err := s.resolveVerseWithText(ctx, user.Tradition, offset, poolSize)
	if err != nil {
		return models.DailyVerse{}, err
	}

	dayKey := day.Format("2006-01-02")
	alreadyShared, err := s.repo.HasSharedVerseOn(ctx, userID, verse.ID, dayKey)
	if err != nil {
		return models.DailyVerse{}, err
	}

	return models.DailyVerse{Verse: verse, Date: dayKey, AlreadyShared: alreadyShared}, nil
}

// dailyVerseFallbackSteps limita quantos vizinhos do pool o service tenta antes
// de desistir e devolver o versículo original sem texto.
const dailyVerseFallbackSteps = 4

// resolveVerseWithText devolve o versículo do offset escolhido, já hidratado.
//
// Se a API não souber resolver aquela referência (as traduções pt-BR gratuitas
// têm buracos), caminha determinísticamente pelos vizinhos do pool até achar um
// com texto — assim uma referência quebrada no catálogo nunca vira um card em
// branco para o usuário. Esgotadas as tentativas, devolve o primeiro candidato:
// a referência sozinha ainda é melhor que um erro.
func (s *Service) resolveVerseWithText(ctx context.Context, tradition models.Tradition, offset, poolSize int64) (models.BibleVerse, error) {
	var first models.BibleVerse
	for step := int64(0); step < dailyVerseFallbackSteps && step < poolSize; step++ {
		candidate, err := s.repo.GetVerseByPoolOffset(ctx, tradition, (offset+step)%poolSize)
		if err != nil {
			return models.BibleVerse{}, err
		}
		candidate = s.hydrateVerseText(ctx, candidate)
		if step == 0 {
			first = candidate
		}
		if candidate.Text != "" {
			return candidate, nil
		}
	}
	return first, nil
}

// hydrateVerseText busca o texto na API quando o catálogo ainda não o tem e
// persiste o resultado, para que as próximas leituras não toquem a rede.
// Best-effort: qualquer falha devolve o versículo como está.
func (s *Service) hydrateVerseText(ctx context.Context, verse models.BibleVerse) models.BibleVerse {
	if verse.Text != "" || s.bible == nil {
		return verse
	}
	ref := bible.Reference{BookSlug: verse.BookSlug, Chapter: verse.Chapter, Verse: verse.Verse}
	text, err := s.bible.Fetch(ctx, ref, verse.Translation)
	if err != nil {
		log.Printf("daily verse text unavailable: ref=%s translation=%s err=%v", ref, verse.Translation, err)
		return verse
	}
	if err := s.repo.SetVerseText(ctx, verse.ID, text); err != nil {
		log.Printf("daily verse text persist failed: id=%s err=%v", verse.ID, err)
	}
	verse.Text = text
	return verse
}

// CreateVerseShare valida e cria um compartilhamento de versículo.
// Espelha as regras de CreatePrayerRequest: só GROUP_ONLY aceita grupos alvo.
func (s *Service) CreateVerseShare(ctx context.Context, in models.CreateVerseShareInput) (models.VerseShare, error) {
	in.Comment = strings.TrimSpace(in.Comment)
	if len([]rune(in.Comment)) > verseCommentMaxRunes {
		return models.VerseShare{}, ErrInvalidVerseComment
	}
	if !models.IsValidVerseShareVisibility(in.Visibility) {
		return models.VerseShare{}, ErrInvalidVerseVisibility
	}
	if in.Visibility == models.VerseVisibilityGroupOnly {
		if len(in.GroupIDs) == 0 {
			return models.VerseShare{}, ErrVerseGroupIDsRequired
		}
	} else if len(in.GroupIDs) > 0 {
		return models.VerseShare{}, ErrVerseGroupsNotAllowed
	}
	if _, err := s.repo.GetVerseByID(ctx, in.VerseID); err != nil {
		return models.VerseShare{}, err
	}
	return s.repo.CreateVerseShare(ctx, in)
}

// GetVerseShare devolve um compartilhamento aplicando o controle de acesso.
func (s *Service) GetVerseShare(ctx context.Context, viewerUserID, shareID string) (models.VerseShare, error) {
	return s.repo.GetVerseShareByID(ctx, viewerUserID, shareID)
}

// DeleteVerseShare apaga (soft delete) um compartilhamento do próprio autor.
func (s *Service) DeleteVerseShare(ctx context.Context, userID, shareID string) error {
	return s.repo.DeleteVerseShare(ctx, userID, shareID)
}

// RecordVerseShareAction registra uma reação num compartilhamento visível ao
// usuário — mesmas regras e mesmo custo de RecordPrayerAction.
func (s *Service) RecordVerseShareAction(ctx context.Context, userID, shareID string, actionType models.PrayerActionType, windowHours int) error {
	in, err := newReactionInput(userID, shareID, actionType, windowHours)
	if err != nil {
		return err
	}
	return mapReactionError(s.repo.RecordVerseShareAction(ctx, in))
}

// ListVerseShareActions lista quem rezou num compartilhamento visível ao viewer.
func (s *Service) ListVerseShareActions(ctx context.Context, viewerUserID, shareID string) ([]models.PrayerActionRecord, error) {
	if _, err := s.repo.GetVerseShareByID(ctx, viewerUserID, shareID); err != nil {
		return nil, err
	}
	return s.repo.ListVerseShareActions(ctx, shareID)
}

// ListPublicFeed devolve o feed público mesclado (pedidos + versículos).
// viewerUserID vazio representa visitante anônimo.
func (s *Service) ListPublicFeed(ctx context.Context, viewerUserID string, limit, offset int) ([]models.FeedItem, int64, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	fetch := limit + offset

	var (
		prayers     []models.PrayerRequest
		verses      []models.VerseShare
		prayerCount int64
		verseCount  int64
	)
	if err := runBounded(ctx,
		func(ctx context.Context) (err error) {
			prayers, err = s.repo.ListPublicPrayerRequests(ctx, viewerUserID, fetch, 0)
			return
		},
		func(ctx context.Context) (err error) {
			verses, err = s.repo.ListPublicVerseShares(ctx, viewerUserID, fetch, 0)
			return
		},
		func(ctx context.Context) (err error) {
			prayerCount, err = s.cachedCount(ctx, "public:"+viewerUserID, func(ctx context.Context) (int64, error) {
				return s.repo.CountPublicPrayerRequests(ctx, viewerUserID)
			})
			return
		},
		func(ctx context.Context) (err error) {
			verseCount, err = s.cachedCount(ctx, "public-verse:"+viewerUserID, func(ctx context.Context) (int64, error) {
				return s.repo.CountPublicVerseShares(ctx, viewerUserID)
			})
			return
		},
	); err != nil {
		return nil, 0, err
	}

	merged := mergeFeedItems(models.WrapPrayerRequests(prayers), models.WrapVerseShares(verses))
	page := sliceFeed(merged, offset, limit)
	if err := s.enrichFeedPage(ctx, viewerUserID, page); err != nil {
		return nil, 0, err
	}
	return page, prayerCount + verseCount, nil
}

// ListFriendsFeed devolve o feed de amigos mesclado (pedidos + versículos).
func (s *Service) ListFriendsFeed(ctx context.Context, userID string, limit, offset int) ([]models.FeedItem, int64, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	fetch := limit + offset

	var (
		prayers     []models.PrayerRequest
		verses      []models.VerseShare
		prayerCount int64
		verseCount  int64
	)
	if err := runBounded(ctx,
		func(ctx context.Context) (err error) {
			prayers, err = s.repo.ListFriendsPrayerRequests(ctx, userID, fetch, 0)
			return
		},
		func(ctx context.Context) (err error) {
			verses, err = s.repo.ListFriendsVerseShares(ctx, userID, fetch, 0)
			return
		},
		func(ctx context.Context) (err error) {
			prayerCount, err = s.cachedCount(ctx, "friends:"+userID, func(ctx context.Context) (int64, error) {
				return s.repo.CountFriendsPrayerRequests(ctx, userID)
			})
			return
		},
		func(ctx context.Context) (err error) {
			verseCount, err = s.cachedCount(ctx, "friends-verse:"+userID, func(ctx context.Context) (int64, error) {
				return s.repo.CountFriendsVerseShares(ctx, userID)
			})
			return
		},
	); err != nil {
		return nil, 0, err
	}

	merged := mergeFeedItems(models.WrapPrayerRequests(prayers), models.WrapVerseShares(verses))
	page := sliceFeed(merged, offset, limit)
	if err := s.enrichFeedPage(ctx, userID, page); err != nil {
		return nil, 0, err
	}
	return page, prayerCount + verseCount, nil
}
