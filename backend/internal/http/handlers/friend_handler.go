package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"parish-viva/backend/internal/http/middleware"
	"parish-viva/backend/internal/http/shared"
	"parish-viva/backend/internal/repositories"
	"parish-viva/backend/internal/services"
)

type FriendHandler struct {
	service *services.Service
}

type sendFriendRequestInput struct {
	TargetUsername string `json:"targetUsername"`
}

func NewFriendHandler(service *services.Service) *FriendHandler {
	return &FriendHandler{service: service}
}

func (h *FriendHandler) ListFriends(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		writeAuthSyncError(w, err)
		return
	}
	items, err := h.service.ListFriends(r.Context(), userID)
	if err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *FriendHandler) ListPendingRequests(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		writeAuthSyncError(w, err)
		return
	}
	items, err := h.service.ListPendingFriendRequests(r.Context(), userID)
	if err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *FriendHandler) SendRequest(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		writeAuthSyncError(w, err)
		return
	}
	var req sendFriendRequestInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		shared.WriteError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload", nil)
		return
	}

	err := h.service.SendFriendRequest(r.Context(), userID, req.TargetUsername)
	if err != nil {
		if errors.Is(err, services.ErrInvalidUsername) {
			shared.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid target username", nil)
			return
		}
		if errors.Is(err, repositories.ErrCannotAddSelf) {
			shared.WriteError(w, http.StatusBadRequest, "CANNOT_ADD_SELF", "You cannot add yourself", nil)
			return
		}
		if errors.Is(err, repositories.ErrFriendUserNotFound) {
			shared.WriteError(w, http.StatusNotFound, "USER_NOT_FOUND", "User not found", nil)
			return
		}
		if errors.Is(err, repositories.ErrFriendRequestAlreadyExists) {
			shared.WriteError(w, http.StatusConflict, "FRIEND_REQUEST_EXISTS", "Friend request already exists", nil)
			return
		}
		if errors.Is(err, repositories.ErrUserBlocked) {
			shared.WriteError(w, http.StatusForbidden, "USER_BLOCKED", "User is blocked", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}

	shared.WriteJSON(w, http.StatusCreated, map[string]any{"status": "requested"})
}

func (h *FriendHandler) AcceptRequest(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		writeAuthSyncError(w, err)
		return
	}
	requestID := chi.URLParam(r, "requestId")
	err := h.service.AcceptFriendRequest(r.Context(), userID, requestID)
	if err != nil {
		if errors.Is(err, repositories.ErrFriendRequestNotFound) {
			shared.WriteError(w, http.StatusNotFound, "FRIEND_REQUEST_NOT_FOUND", "Friend request not found", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"status": "accepted"})
}

func (h *FriendHandler) RejectRequest(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		writeAuthSyncError(w, err)
		return
	}
	requestID := chi.URLParam(r, "requestId")
	err := h.service.RejectFriendRequest(r.Context(), userID, requestID)
	if err != nil {
		if errors.Is(err, repositories.ErrFriendRequestNotFound) {
			shared.WriteError(w, http.StatusNotFound, "FRIEND_REQUEST_NOT_FOUND", "Friend request not found", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"status": "rejected"})
}

func (h *FriendHandler) CancelRequest(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		writeAuthSyncError(w, err)
		return
	}
	requestID := chi.URLParam(r, "requestId")
	err := h.service.CancelFriendRequest(r.Context(), userID, requestID)
	if err != nil {
		if errors.Is(err, repositories.ErrFriendRequestNotFound) {
			shared.WriteError(w, http.StatusNotFound, "FRIEND_REQUEST_NOT_FOUND", "Friend request not found", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"status": "cancelled"})
}

func (h *FriendHandler) RemoveFriend(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		writeAuthSyncError(w, err)
		return
	}
	targetUserID := chi.URLParam(r, "userId")
	err := h.service.RemoveFriendship(r.Context(), userID, targetUserID)
	if err != nil {
		if errors.Is(err, services.ErrCannotTargetSelf) {
			shared.WriteError(w, http.StatusBadRequest, "CANNOT_TARGET_SELF", "You cannot remove yourself", nil)
			return
		}
		if errors.Is(err, repositories.ErrFriendshipNotFound) {
			shared.WriteError(w, http.StatusNotFound, "FRIENDSHIP_NOT_FOUND", "Friendship not found", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"status": "removed"})
}

func (h *FriendHandler) SuggestFriends(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		writeAuthSyncError(w, err)
		return
	}
	items, err := h.service.SuggestFriends(r.Context(), userID, 10)
	if err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *FriendHandler) SearchUsers(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		writeAuthSyncError(w, err)
		return
	}
	query := r.URL.Query().Get("q")
	items, err := h.service.SearchUsersForFriendship(r.Context(), userID, query, 20)
	if err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}
