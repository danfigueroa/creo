package services

import (
	"context"
	"errors"
	"regexp"
	"strings"

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

func (s *Service) ListHomePrayerRequests(ctx context.Context, userID string, limit, offset int) ([]models.PrayerRequest, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	return s.repo.ListHomePrayerRequests(ctx, userID, limit, offset)
}

func (s *Service) CountHomePrayerRequests(ctx context.Context, userID string) (int64, error) {
	return s.repo.CountHomePrayerRequests(ctx, userID)
}

func (s *Service) ListGroupsPrayerRequests(ctx context.Context, userID string, limit, offset int) ([]models.PrayerRequest, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	return s.repo.ListGroupsPrayerRequests(ctx, userID, limit, offset)
}

func (s *Service) CountGroupsPrayerRequests(ctx context.Context, userID string) (int64, error) {
	return s.repo.CountGroupsPrayerRequests(ctx, userID)
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

func (s *Service) ListPrayerRequestsByGroup(ctx context.Context, viewerUserID, groupID string, limit, offset int) ([]models.PrayerRequest, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	if err := s.ensureGroupFeedAccess(ctx, viewerUserID, groupID); err != nil {
		return nil, err
	}
	return s.repo.ListPrayerRequestsByGroup(ctx, viewerUserID, groupID, limit, offset)
}

func (s *Service) CountPrayerRequestsByGroup(ctx context.Context, viewerUserID, groupID string) (int64, error) {
	if err := s.ensureGroupFeedAccess(ctx, viewerUserID, groupID); err != nil {
		return 0, err
	}
	return s.repo.CountPrayerRequestsByGroup(ctx, viewerUserID, groupID)
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
		case models.PrayerActionIPrayed, models.PrayerActionIntercession, models.PrayerActionFasting, models.PrayerActionGratitude, models.PrayerActionCryingOut:
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
