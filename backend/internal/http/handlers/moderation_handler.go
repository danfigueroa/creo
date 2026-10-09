package handlers

import (
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

type ModerationHandler struct {
	service *services.Service
}

type moderationActionInput struct {
	Reason string `json:"reason"`
}

func NewModerationHandler(service *services.Service) *ModerationHandler {
	return &ModerationHandler{service: service}
}

func (h *ModerationHandler) Queue(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		writeAuthSyncError(w, err)
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	items, err := h.service.ListModerationQueue(r.Context(), userID, limit, offset)
	if err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *ModerationHandler) Approve(w http.ResponseWriter, r *http.Request) {
	h.applyAction(w, r, models.ActionApprove)
}

func (h *ModerationHandler) Reject(w http.ResponseWriter, r *http.Request) {
	h.applyAction(w, r, models.ActionReject)
}

func (h *ModerationHandler) RequestChanges(w http.ResponseWriter, r *http.Request) {
	h.applyAction(w, r, models.ActionRequestChanges)
}

func (h *ModerationHandler) History(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		writeAuthSyncError(w, err)
		return
	}
	requestID := chi.URLParam(r, "requestId")
	items, err := h.service.ListModerationHistory(r.Context(), userID, requestID)
	if err != nil {
		switch {
		case errors.Is(err, repositories.ErrPrayerRequestNotFound):
			shared.WriteError(w, http.StatusNotFound, "PRAYER_REQUEST_NOT_FOUND", "Prayer request not found", nil)
		case errors.Is(err, repositories.ErrPrayerRequestForbidden):
			shared.WriteError(w, http.StatusForbidden, "FORBIDDEN", "You cannot view this moderation history", nil)
		default:
			shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		}
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *ModerationHandler) applyAction(w http.ResponseWriter, r *http.Request, action models.ModerationActionType) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		writeAuthSyncError(w, err)
		return
	}
	requestID := chi.URLParam(r, "requestId")

	var in moderationActionInput
	if err := decodeOptionalJSON(r, &in); err != nil {
		shared.WriteError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload", nil)
		return
	}

	err := h.service.ApplyModerationAction(r.Context(), userID, requestID, action, in.Reason)
	if err != nil {
		switch {
		case errors.Is(err, services.ErrModerationReasonRequired):
			shared.WriteError(w, http.StatusBadRequest, "MODERATION_REASON_REQUIRED", "Reason is required", nil)
		case errors.Is(err, services.ErrInvalidModerationAction):
			shared.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid action", nil)
		case errors.Is(err, repositories.ErrPrayerRequestNotFound):
			shared.WriteError(w, http.StatusNotFound, "PRAYER_REQUEST_NOT_FOUND", "Prayer request not found", nil)
		case errors.Is(err, repositories.ErrPrayerRequestForbidden):
			shared.WriteError(w, http.StatusForbidden, "FORBIDDEN", "You cannot moderate this request", nil)
		case errors.Is(err, repositories.ErrModerationNotApplicable):
			shared.WriteError(w, http.StatusConflict, "MODERATION_NOT_APPLICABLE", "Moderation not applicable for this request", nil)
		default:
			shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		}
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"status": "ok"})
}
