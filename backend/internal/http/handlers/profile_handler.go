package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"parish-viva/backend/internal/http/middleware"
	"parish-viva/backend/internal/http/shared"
	"parish-viva/backend/internal/models"
	"parish-viva/backend/internal/repositories"
	"parish-viva/backend/internal/services"

	"github.com/go-chi/chi/v5"
)

type ProfileHandler struct {
	service *services.Service
}

type updateProfileRequest struct {
	DisplayName string  `json:"displayName"`
	Username    string  `json:"username"`
	AvatarURL   *string `json:"avatarUrl"`
	Bio         *string `json:"bio"`
}

type updateTraditionRequest struct {
	Tradition string `json:"tradition"`
}

type updateLanguageRequest struct {
	Language string `json:"language"`
}

func NewProfileHandler(service *services.Service) *ProfileHandler {
	return &ProfileHandler{service: service}
}

func (h *ProfileHandler) GetProfile(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	profile, err := h.service.GetProfile(r.Context(), userID)
	if err != nil {
		shared.WriteError(w, http.StatusNotFound, "USER_NOT_FOUND", "User not found", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, profile)
}

func (h *ProfileHandler) ListMyPrayers(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	items, err := h.service.ListMyPrayers(r.Context(), userID, 30, 0)
	if err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *ProfileHandler) GetProfileStats(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	stats, err := h.service.GetUserStats(r.Context(), userID)
	if err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, stats)
}

func (h *ProfileHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	body, err := io.ReadAll(r.Body)
	if err != nil {
		shared.WriteError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload", nil)
		return
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		shared.WriteError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload", nil)
		return
	}
	var req updateProfileRequest
	if err := json.Unmarshal(body, &req); err != nil {
		shared.WriteError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload", nil)
		return
	}
	_, hasAvatar := raw["avatarUrl"]
	_, hasBio := raw["bio"]
	profile, err := h.service.UpdateProfile(r.Context(), userID, req.DisplayName, req.Username, req.AvatarURL, hasAvatar, req.Bio, hasBio)
	if err != nil {
		if errors.Is(err, repositories.ErrUsernameTaken) {
			shared.WriteError(w, http.StatusConflict, "USERNAME_TAKEN", "This username is already in use", nil)
			return
		}
		if errors.Is(err, services.ErrInvalidDisplayName) || errors.Is(err, services.ErrInvalidUsername) || errors.Is(err, services.ErrInvalidBio) || errors.Is(err, services.ErrInvalidImageURL) {
			shared.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error(), nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, profile)
}

func (h *ProfileHandler) GetPublicProfile(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	username := chi.URLParam(r, "username")
	profile, err := h.service.GetPublicProfile(r.Context(), userID, username)
	if err != nil {
		if errors.Is(err, repositories.ErrUserNotFound) {
			shared.WriteError(w, http.StatusNotFound, "USER_NOT_FOUND", "User not found", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, profile)
}

func (h *ProfileHandler) UpdateTradition(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	var req updateTraditionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		shared.WriteError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload", nil)
		return
	}
	profile, err := h.service.SetUserTradition(r.Context(), userID, models.Tradition(req.Tradition))
	if err != nil {
		if errors.Is(err, services.ErrInvalidTradition) {
			shared.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid tradition", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, profile)
}

func (h *ProfileHandler) UpdateLanguage(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	var req updateLanguageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		shared.WriteError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload", nil)
		return
	}
	profile, err := h.service.SetUserLanguage(r.Context(), userID, models.Language(req.Language))
	if err != nil {
		if errors.Is(err, services.ErrInvalidLanguage) {
			shared.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid language", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, profile)
}

func (h *ProfileHandler) UsernameAvailability(w http.ResponseWriter, r *http.Request) {
	username := r.URL.Query().Get("username")
	available, err := h.service.IsUsernameAvailable(r.Context(), username)
	if err != nil {
		if errors.Is(err, services.ErrInvalidUsername) {
			shared.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid username", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"available": available})
}
