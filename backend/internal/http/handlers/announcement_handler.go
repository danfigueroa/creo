package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"parish-viva/backend/internal/http/middleware"
	"parish-viva/backend/internal/http/shared"
	"parish-viva/backend/internal/models"
	"parish-viva/backend/internal/repositories"
	"parish-viva/backend/internal/services"
)

type AnnouncementHandler struct {
	service *services.Service
}

func NewAnnouncementHandler(service *services.Service) *AnnouncementHandler {
	return &AnnouncementHandler{service: service}
}

type createAnnouncementRequest struct {
	Title    string  `json:"title"`
	Body     string  `json:"body"`
	EventAt  string  `json:"eventAt"`
	ImageURL *string `json:"imageUrl"`
}

type updateAnnouncementRequest struct {
	Title    *string `json:"title"`
	Body     *string `json:"body"`
	EventAt  *string `json:"eventAt"`
	ImageURL *string `json:"imageUrl"`
}

func parseAnnouncementTime(value string) (time.Time, error) {
	if value == "" {
		return time.Time{}, services.ErrAnnouncementInvalidEventAt
	}
	if t, err := time.Parse(time.RFC3339, value); err == nil {
		return t, nil
	}
	if t, err := time.Parse("2006-01-02T15:04", value); err == nil {
		return t.UTC(), nil
	}
	return time.Time{}, services.ErrAnnouncementInvalidEventAt
}

func (h *AnnouncementHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	groupID := chi.URLParam(r, "id")
	var req createAnnouncementRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		shared.WriteError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload", nil)
		return
	}
	eventAt, err := parseAnnouncementTime(req.EventAt)
	if err != nil {
		shared.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "eventAt is invalid", nil)
		return
	}
	announcement, err := h.service.CreateAnnouncement(r.Context(), userID, groupID, req.Title, req.Body, eventAt, req.ImageURL)
	if err != nil {
		writeAnnouncementError(w, err)
		return
	}
	shared.WriteJSON(w, http.StatusCreated, announcement)
}

func (h *AnnouncementHandler) ListByGroup(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	groupID := chi.URLParam(r, "id")
	limit, offset, page := parseFeedPagination(r)
	items, total, err := h.service.ListAnnouncementsByGroup(r.Context(), userID, groupID, limit, offset)
	if err != nil {
		writeAnnouncementError(w, err)
		return
	}
	totalPages := int((total + int64(limit) - 1) / int64(limit))
	if totalPages == 0 {
		totalPages = 1
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{
		"items": items,
		"pagination": feedPagination{
			Page:       page,
			PageSize:   limit,
			Total:      total,
			TotalPages: totalPages,
		},
	})
}

func (h *AnnouncementHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	announcementID := chi.URLParam(r, "aid")
	var req updateAnnouncementRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		shared.WriteError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload", nil)
		return
	}
	in := models.UpdateAnnouncementInput{
		Title:    req.Title,
		Body:     req.Body,
		ImageURL: req.ImageURL,
	}
	if req.EventAt != nil {
		t, err := parseAnnouncementTime(*req.EventAt)
		if err != nil {
			shared.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "eventAt is invalid", nil)
			return
		}
		in.EventAt = &t
	}
	announcement, err := h.service.UpdateAnnouncement(r.Context(), userID, chi.URLParam(r, "id"), announcementID, in)
	if err != nil {
		writeAnnouncementError(w, err)
		return
	}
	shared.WriteJSON(w, http.StatusOK, announcement)
}

func (h *AnnouncementHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	announcementID := chi.URLParam(r, "aid")
	if err := h.service.DeleteAnnouncement(r.Context(), userID, chi.URLParam(r, "id"), announcementID); err != nil {
		writeAnnouncementError(w, err)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"status": "deleted"})
}

func writeAnnouncementError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, repositories.ErrAnnouncementNotFound):
		shared.WriteError(w, http.StatusNotFound, "ANNOUNCEMENT_NOT_FOUND", "Announcement not found", nil)
	case errors.Is(err, repositories.ErrGroupNotFound):
		shared.WriteError(w, http.StatusNotFound, "GROUP_NOT_FOUND", "Group not found", nil)
	case errors.Is(err, services.ErrPermissionDenied):
		shared.WriteError(w, http.StatusForbidden, "FORBIDDEN", "You do not have permission to perform this action", nil)
	case errors.Is(err, services.ErrAnnouncementInvalidTitle),
		errors.Is(err, services.ErrAnnouncementInvalidBody),
		errors.Is(err, services.ErrAnnouncementInvalidEventAt),
		errors.Is(err, services.ErrInvalidImageURL):
		shared.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error(), nil)
	default:
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
	}
}
