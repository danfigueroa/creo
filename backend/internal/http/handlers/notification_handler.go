package handlers

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"parish-viva/backend/internal/http/middleware"
	"parish-viva/backend/internal/http/shared"
	"parish-viva/backend/internal/services"
)

type NotificationHandler struct {
	service *services.Service
}

func NewNotificationHandler(service *services.Service) *NotificationHandler {
	return &NotificationHandler{service: service}
}

func (h *NotificationHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		writeAuthSyncError(w, err)
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))

	items, summary, err := h.service.ListNotifications(r.Context(), userID, limit, offset)
	if err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{
		"items":          items,
		"unreadCount":    summary.Count,
		"friendRequests": summary.FriendRequests,
	})
}

func (h *NotificationHandler) UnreadCount(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		writeAuthSyncError(w, err)
		return
	}
	summary, err := h.service.GetNotificationSummary(r.Context(), userID)
	if err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, summary)
}

func (h *NotificationHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		writeAuthSyncError(w, err)
		return
	}
	id := chi.URLParam(r, "id")
	if err := h.service.MarkNotificationRead(r.Context(), userID, id); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"status": "read"})
}

func (h *NotificationHandler) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		writeAuthSyncError(w, err)
		return
	}
	if err := h.service.MarkAllNotificationsRead(r.Context(), userID); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"status": "read"})
}
