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

type BlockHandler struct {
	service *services.Service
}

type blockUserInput struct {
	TargetUsername string `json:"targetUsername"`
}

func NewBlockHandler(service *services.Service) *BlockHandler {
	return &BlockHandler{service: service}
}

func (h *BlockHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		writeAuthSyncError(w, err)
		return
	}
	items, err := h.service.ListBlockedUsers(r.Context(), userID)
	if err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *BlockHandler) Block(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		writeAuthSyncError(w, err)
		return
	}
	var req blockUserInput
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		shared.WriteError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload", nil)
		return
	}

	blocked, err := h.service.BlockUser(r.Context(), userID, req.TargetUsername)
	if err != nil {
		if errors.Is(err, services.ErrInvalidUsername) {
			shared.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid target username", nil)
			return
		}
		if errors.Is(err, repositories.ErrCannotAddSelf) {
			shared.WriteError(w, http.StatusBadRequest, "CANNOT_TARGET_SELF", "You cannot block yourself", nil)
			return
		}
		if errors.Is(err, repositories.ErrUserNotFound) {
			shared.WriteError(w, http.StatusNotFound, "USER_NOT_FOUND", "User not found", nil)
			return
		}
		if errors.Is(err, repositories.ErrAlreadyBlocked) {
			shared.WriteError(w, http.StatusConflict, "ALREADY_BLOCKED", "User already blocked", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusCreated, blocked)
}

func (h *BlockHandler) Unblock(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		writeAuthSyncError(w, err)
		return
	}
	targetUserID := chi.URLParam(r, "userId")
	err := h.service.UnblockUser(r.Context(), userID, targetUserID)
	if err != nil {
		if errors.Is(err, repositories.ErrBlockNotFound) {
			shared.WriteError(w, http.StatusNotFound, "BLOCK_NOT_FOUND", "Block not found", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"status": "unblocked"})
}
