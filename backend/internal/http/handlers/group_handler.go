package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"parish-viva/backend/internal/http/middleware"
	"parish-viva/backend/internal/http/shared"
	"parish-viva/backend/internal/models"
	"parish-viva/backend/internal/repositories"
	"parish-viva/backend/internal/services"
)

type GroupHandler struct {
	service *services.Service
}

type createGroupRequest struct {
	Name        string  `json:"name"`
	Description string  `json:"description"`
	ImageURL    *string `json:"imageUrl"`
	JoinPolicy  string  `json:"joinPolicy"`
}

type updateGroupRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	ImageURL    *string `json:"imageUrl"`
	JoinPolicy  *string `json:"joinPolicy"`
}

type changeMemberRoleRequest struct {
	Role string `json:"role"`
}

func NewGroupHandler(service *services.Service) *GroupHandler {
	return &GroupHandler{service: service}
}

func (h *GroupHandler) ListMine(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	items, err := h.service.ListUserGroups(r.Context(), userID)
	if err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *GroupHandler) Search(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	query := r.URL.Query().Get("q")
	items, err := h.service.SearchGroupsByName(r.Context(), userID, query, 20)
	if err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *GroupHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	var req createGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		shared.WriteError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload", nil)
		return
	}

	group, err := h.service.CreateGroup(r.Context(), userID, req.Name, req.Description, req.ImageURL, models.GroupJoinPolicy(req.JoinPolicy))
	if err != nil {
		if errors.Is(err, services.ErrInvalidGroupName) || errors.Is(err, services.ErrInvalidGroupDescription) || errors.Is(err, services.ErrInvalidJoinPolicy) {
			shared.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error(), nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}

	shared.WriteJSON(w, http.StatusCreated, group)
}

func (h *GroupHandler) RequestJoin(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	groupID := chi.URLParam(r, "id")
	err := h.service.RequestJoinGroup(r.Context(), userID, groupID)
	if err != nil {
		if errors.Is(err, repositories.ErrInviteOnlyGroup) {
			shared.WriteError(w, http.StatusForbidden, "GROUP_INVITE_ONLY", "This group is invite only", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"status": "requested"})
}

func (h *GroupHandler) ListJoinRequests(w http.ResponseWriter, r *http.Request) {
	actorUserID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	groupID := chi.URLParam(r, "id")
	items, err := h.service.ListGroupJoinRequests(r.Context(), actorUserID, groupID)
	if err != nil {
		if errors.Is(err, repositories.ErrGroupAdminRequired) {
			shared.WriteError(w, http.StatusForbidden, "FORBIDDEN", "Group admin access required", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *GroupHandler) GetDetails(w http.ResponseWriter, r *http.Request) {
	viewerID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	groupID := chi.URLParam(r, "id")
	details, err := h.service.GetGroupDetails(r.Context(), viewerID, groupID)
	if err != nil {
		if errors.Is(err, repositories.ErrGroupNotFound) {
			shared.WriteError(w, http.StatusNotFound, "GROUP_NOT_FOUND", "Group not found", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, details)
}

func (h *GroupHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	viewerID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	groupID := chi.URLParam(r, "id")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	items, total, err := h.service.ListGroupMembers(r.Context(), viewerID, groupID, limit, offset)
	if err != nil {
		if errors.Is(err, services.ErrPermissionDenied) {
			shared.WriteError(w, http.StatusForbidden, "FORBIDDEN", "You must be a member of this group", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{
		"items": items,
		"total": total,
	})
}

func (h *GroupHandler) ChangeMemberRole(w http.ResponseWriter, r *http.Request) {
	actorID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	groupID := chi.URLParam(r, "id")
	targetUserID := chi.URLParam(r, "userId")
	var req changeMemberRoleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		shared.WriteError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload", nil)
		return
	}
	err := h.service.ChangeMemberRole(r.Context(), actorID, groupID, targetUserID, models.GroupRole(req.Role))
	if err != nil {
		if errors.Is(err, services.ErrPermissionDenied) {
			shared.WriteError(w, http.StatusForbidden, "FORBIDDEN", "Only group admins can change roles", nil)
			return
		}
		if errors.Is(err, services.ErrInvalidGroupRole) {
			shared.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid role", nil)
			return
		}
		if errors.Is(err, services.ErrLastAdmin) {
			shared.WriteError(w, http.StatusConflict, "LAST_ADMIN", "At least one admin must remain in the group", nil)
			return
		}
		if errors.Is(err, repositories.ErrGroupMembershipNotFound) {
			shared.WriteError(w, http.StatusNotFound, "MEMBERSHIP_NOT_FOUND", "Member not found in this group", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"status": "updated"})
}

func (h *GroupHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	actorID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	groupID := chi.URLParam(r, "id")
	targetUserID := chi.URLParam(r, "userId")
	err := h.service.RemoveGroupMember(r.Context(), actorID, groupID, targetUserID)
	if err != nil {
		if errors.Is(err, services.ErrPermissionDenied) {
			shared.WriteError(w, http.StatusForbidden, "FORBIDDEN", "You don't have permission to remove this member", nil)
			return
		}
		if errors.Is(err, services.ErrCannotTargetSelf) {
			shared.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Use POST /leave to leave the group yourself", nil)
			return
		}
		if errors.Is(err, services.ErrLastAdmin) {
			shared.WriteError(w, http.StatusConflict, "LAST_ADMIN", "Cannot remove the last admin", nil)
			return
		}
		if errors.Is(err, repositories.ErrGroupMembershipNotFound) {
			shared.WriteError(w, http.StatusNotFound, "MEMBERSHIP_NOT_FOUND", "Member not found in this group", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"status": "removed"})
}

func (h *GroupHandler) Leave(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	groupID := chi.URLParam(r, "id")
	err := h.service.LeaveGroup(r.Context(), userID, groupID)
	if err != nil {
		if errors.Is(err, services.ErrLastAdmin) {
			shared.WriteError(w, http.StatusConflict, "LAST_ADMIN", "Promote another admin before leaving the group", nil)
			return
		}
		if errors.Is(err, repositories.ErrGroupMembershipNotFound) {
			shared.WriteError(w, http.StatusNotFound, "MEMBERSHIP_NOT_FOUND", "You are not a member of this group", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"status": "left"})
}

func (h *GroupHandler) Update(w http.ResponseWriter, r *http.Request) {
	actorID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	groupID := chi.URLParam(r, "id")
	var req updateGroupRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		shared.WriteError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload", nil)
		return
	}
	in := models.UpdateGroupInput{
		Name:        req.Name,
		Description: req.Description,
		ImageURL:    req.ImageURL,
	}
	if req.JoinPolicy != nil {
		jp := models.GroupJoinPolicy(*req.JoinPolicy)
		in.JoinPolicy = &jp
	}
	group, err := h.service.UpdateGroup(r.Context(), actorID, groupID, in)
	if err != nil {
		if errors.Is(err, services.ErrPermissionDenied) {
			shared.WriteError(w, http.StatusForbidden, "FORBIDDEN", "Only group admins can edit the group", nil)
			return
		}
		if errors.Is(err, services.ErrInvalidGroupName) || errors.Is(err, services.ErrInvalidGroupDescription) || errors.Is(err, services.ErrInvalidJoinPolicy) {
			shared.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error(), nil)
			return
		}
		if errors.Is(err, repositories.ErrGroupNotFound) {
			shared.WriteError(w, http.StatusNotFound, "GROUP_NOT_FOUND", "Group not found", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, group)
}

func (h *GroupHandler) ListGroupFeed(w http.ResponseWriter, r *http.Request) {
	viewerID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	groupID := chi.URLParam(r, "id")
	limit, offset, page := parseFeedPagination(r)
	items, total, err := h.service.ListGroupFeed(r.Context(), viewerID, groupID, limit, offset)
	if err != nil {
		if errors.Is(err, services.ErrPermissionDenied) {
			shared.WriteError(w, http.StatusForbidden, "FORBIDDEN", "You must be a member to view this group's feed", nil)
			return
		}
		if errors.Is(err, repositories.ErrGroupNotFound) {
			shared.WriteError(w, http.StatusNotFound, "GROUP_NOT_FOUND", "Group not found", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	writeFeedResponse(w, items, page, limit, total)
}

func (h *GroupHandler) ApproveJoinRequest(w http.ResponseWriter, r *http.Request) {
	actorUserID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	groupID := chi.URLParam(r, "id")
	requestID := chi.URLParam(r, "requestId")
	err := h.service.ApproveGroupJoinRequest(r.Context(), actorUserID, groupID, requestID)
	if err != nil {
		if errors.Is(err, repositories.ErrGroupAdminRequired) {
			shared.WriteError(w, http.StatusForbidden, "FORBIDDEN", "Group admin access required", nil)
			return
		}
		if errors.Is(err, repositories.ErrJoinRequestNotFound) {
			shared.WriteError(w, http.StatusNotFound, "JOIN_REQUEST_NOT_FOUND", "Join request not found", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"status": "approved"})
}

func (h *GroupHandler) RejectJoinRequest(w http.ResponseWriter, r *http.Request) {
	actorUserID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	groupID := chi.URLParam(r, "id")
	requestID := chi.URLParam(r, "requestId")
	err := h.service.RejectGroupJoinRequest(r.Context(), actorUserID, groupID, requestID)
	if err != nil {
		if errors.Is(err, repositories.ErrGroupAdminRequired) {
			shared.WriteError(w, http.StatusForbidden, "FORBIDDEN", "Group admin access required", nil)
			return
		}
		if errors.Is(err, repositories.ErrJoinRequestNotFound) {
			shared.WriteError(w, http.StatusNotFound, "JOIN_REQUEST_NOT_FOUND", "Join request not found", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"status": "rejected"})
}
