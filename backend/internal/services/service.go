package services

import (
	"context"
	"errors"
	"regexp"
	"sort"
	"strings"
	"time"

	"parish-viva/backend/internal/models"
	"parish-viva/backend/internal/repositories"
)

type Service struct {
	repo repositories.Repository
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

func NewService(repo repositories.Repository) *Service {
	return &Service{repo: repo}
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

func (s *Service) ListPublicPrayerRequests(ctx context.Context, viewerUserID string, limit, offset int) ([]models.PrayerRequest, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	return s.repo.ListPublicPrayerRequests(ctx, viewerUserID, limit, offset)
}

func (s *Service) CountPublicPrayerRequests(ctx context.Context, viewerUserID string) (int64, error) {
	return s.repo.CountPublicPrayerRequests(ctx, viewerUserID)
}

func (s *Service) RecordPrayerAction(ctx context.Context, userID, requestID string, actionType models.PrayerActionType, windowHours int) error {
	if windowHours < 1 {
		windowHours = 12
	}
	viewer, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return err
	}
	if !isValidPrayerActionTypeFor(viewer.Tradition, actionType) {
		return ErrInvalidPrayerActionType
	}
	return s.repo.RecordPrayerAction(ctx, userID, requestID, actionType, windowHours)
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

func (s *Service) DefaultPrayerActionFor(ctx context.Context, userID string) models.PrayerActionType {
	user, err := s.repo.GetUserByID(ctx, userID)
	if err != nil {
		return models.PrayerActionHailMary
	}
	if user.Tradition == models.TraditionEvangelical {
		return models.PrayerActionIPrayed
	}
	return models.PrayerActionHailMary
}

func (s *Service) ListFriendsPrayerRequests(ctx context.Context, userID string, limit, offset int) ([]models.PrayerRequest, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	return s.repo.ListFriendsPrayerRequests(ctx, userID, limit, offset)
}

func (s *Service) CountFriendsPrayerRequests(ctx context.Context, userID string) (int64, error) {
	return s.repo.CountFriendsPrayerRequests(ctx, userID)
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
	return s.repo.UpsertAuthUser(ctx, userID, email, preferredUsername, preferredDisplayName, preferredTradition)
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

func isValidPrayerActionTypeFor(tradition models.Tradition, actionType models.PrayerActionType) bool {
	switch tradition {
	case models.TraditionEvangelical:
		switch actionType {
		case models.PrayerActionIPrayed, models.PrayerActionIntercession, models.PrayerActionFasting, models.PrayerActionGratitude, models.PrayerActionCryingOut, models.PrayerActionPurpose:
			return true
		}
		return false
	default:
		switch actionType {
		case models.PrayerActionHailMary, models.PrayerActionOurFather, models.PrayerActionGloryBe, models.PrayerActionRosaryDecade, models.PrayerActionRosaryFull:
			return true
		}
		return false
	}
}

func isValidTradition(tradition models.Tradition) bool {
	switch tradition {
	case models.TraditionCatholic, models.TraditionEvangelical:
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
func mergeFeedItems(prayers, announcements []models.FeedItem) []models.FeedItem {
	out := make([]models.FeedItem, 0, len(prayers)+len(announcements))
	out = append(out, prayers...)
	out = append(out, announcements...)
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
	prayers, err := s.repo.ListPrayerRequestsByGroup(ctx, viewerUserID, groupID, fetch, 0)
	if err != nil {
		return nil, 0, err
	}
	announcements, err := s.repo.ListAnnouncementsByGroup(ctx, groupID, fetch, 0)
	if err != nil {
		return nil, 0, err
	}
	prayerCount, err := s.repo.CountPrayerRequestsByGroup(ctx, viewerUserID, groupID)
	if err != nil {
		return nil, 0, err
	}
	announcementCount, err := s.repo.CountAnnouncementsByGroup(ctx, groupID)
	if err != nil {
		return nil, 0, err
	}
	merged := mergeFeedItems(models.WrapPrayerRequests(prayers), models.WrapAnnouncements(announcements))
	return sliceFeed(merged, offset, limit), prayerCount + announcementCount, nil
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
	prayers, err := s.repo.ListHomePrayerRequests(ctx, userID, fetch, 0)
	if err != nil {
		return nil, 0, err
	}
	announcements, err := s.repo.ListAnnouncementsForUser(ctx, userID, fetch, 0)
	if err != nil {
		return nil, 0, err
	}
	prayerCount, err := s.repo.CountHomePrayerRequests(ctx, userID)
	if err != nil {
		return nil, 0, err
	}
	announcementCount, err := s.repo.CountAnnouncementsForUser(ctx, userID)
	if err != nil {
		return nil, 0, err
	}
	merged := mergeFeedItems(models.WrapPrayerRequests(prayers), models.WrapAnnouncements(announcements))
	return sliceFeed(merged, offset, limit), prayerCount + announcementCount, nil
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
	prayers, err := s.repo.ListGroupsPrayerRequests(ctx, userID, fetch, 0)
	if err != nil {
		return nil, 0, err
	}
	announcements, err := s.repo.ListAnnouncementsForUser(ctx, userID, fetch, 0)
	if err != nil {
		return nil, 0, err
	}
	prayerCount, err := s.repo.CountGroupsPrayerRequests(ctx, userID)
	if err != nil {
		return nil, 0, err
	}
	announcementCount, err := s.repo.CountAnnouncementsForUser(ctx, userID)
	if err != nil {
		return nil, 0, err
	}
	merged := mergeFeedItems(models.WrapPrayerRequests(prayers), models.WrapAnnouncements(announcements))
	return sliceFeed(merged, offset, limit), prayerCount + announcementCount, nil
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

func (s *Service) ListModerationHistory(ctx context.Context, requestID string) ([]models.ModerationActionRecord, error) {
	return s.repo.ListModerationHistory(ctx, requestID)
}
