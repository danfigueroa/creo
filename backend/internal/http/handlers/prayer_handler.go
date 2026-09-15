package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"

	"parish-viva/backend/internal/http/middleware"
	"parish-viva/backend/internal/http/shared"
	"parish-viva/backend/internal/models"
	"parish-viva/backend/internal/repositories"
	"parish-viva/backend/internal/services"
)

type PrayerHandler struct {
	service          *services.Service
	prayedWindowHour int
}

type createPrayerRequest struct {
	Title          string   `json:"title"`
	Body           string   `json:"body"`
	Category       string   `json:"category"`
	Visibility     string   `json:"visibility"`
	AllowAnonymous bool     `json:"allowAnonymous"`
	GroupIDs       []string `json:"groupIds"`
}

type updatePrayerRequest struct {
	Title          string   `json:"title"`
	Body           string   `json:"body"`
	Category       string   `json:"category"`
	Visibility     string   `json:"visibility"`
	AllowAnonymous bool     `json:"allowAnonymous"`
	GroupIDs       []string `json:"groupIds"`
}

type prayRequest struct {
	ActionType string `json:"actionType"`
}

type feedPagination struct {
	Page       int   `json:"page"`
	PageSize   int   `json:"pageSize"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"totalPages"`
}

func NewPrayerHandler(service *services.Service, prayedWindowHour int) *PrayerHandler {
	return &PrayerHandler{service: service, prayedWindowHour: prayedWindowHour}
}

func (h *PrayerHandler) ListPublic(w http.ResponseWriter, r *http.Request) {
	limit, offset, page := parseFeedPagination(r)
	viewerUserID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if viewerUserID != "" {
		if err := ensureAuthUser(h.service, r); err != nil {
			shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
			return
		}
	}
	items, total, err := h.service.ListPublicFeed(r.Context(), viewerUserID, limit, offset)
	if err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	if viewerUserID == "" {
		// O feed público anônimo é idêntico para qualquer visitante: o CDN pode
		// absorver os acessos por alguns segundos sem cachear no browser.
		w.Header().Set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60")
		w.Header().Set("Vary", "Authorization")
	}
	writeFeedResponse(w, items, page, limit, total)
}

func (h *PrayerHandler) ListHome(w http.ResponseWriter, r *http.Request) {
	limit, offset, page := parseFeedPagination(r)
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	items, total, err := h.service.ListHomeFeed(r.Context(), userID, limit, offset)
	if err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	writeFeedResponse(w, items, page, limit, total)
}

func (h *PrayerHandler) ListGroupsFeed(w http.ResponseWriter, r *http.Request) {
	limit, offset, page := parseFeedPagination(r)
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	items, total, err := h.service.ListGroupsFeed(r.Context(), userID, limit, offset)
	if err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	writeFeedResponse(w, items, page, limit, total)
}

func (h *PrayerHandler) ListFriendsFeed(w http.ResponseWriter, r *http.Request) {
	limit, offset, page := parseFeedPagination(r)
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	items, total, err := h.service.ListFriendsFeed(r.Context(), userID, limit, offset)
	if err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	writeFeedResponse(w, items, page, limit, total)
}

func parseFeedPagination(r *http.Request) (int, int, int) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	page := (offset / limit) + 1
	return limit, offset, page
}

func writeFeedResponse(w http.ResponseWriter, items []models.FeedItem, page, pageSize int, total int64) {
	totalPages := int((total + int64(pageSize) - 1) / int64(pageSize))
	if totalPages == 0 {
		totalPages = 1
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{
		"items": items,
		"pagination": feedPagination{
			Page:       page,
			PageSize:   pageSize,
			Total:      total,
			TotalPages: totalPages,
		},
	})
}

func (h *PrayerHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	var req createPrayerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		shared.WriteError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload", nil)
		return
	}

	prayer, err := h.service.CreatePrayerRequest(r.Context(), models.CreatePrayerRequestInput{
		AuthorID:       userID,
		Title:          req.Title,
		Body:           req.Body,
		Category:       models.PrayerCategory(req.Category),
		Visibility:     models.Visibility(req.Visibility),
		AllowAnonymous: req.AllowAnonymous,
		GroupIDs:       req.GroupIDs,
	})
	if err != nil {
		writePrayerWriteError(w, err)
		return
	}
	shared.WriteJSON(w, http.StatusCreated, prayer)
}

// writePrayerWriteError mapeia os erros de criar/editar pedido. Create e
// Update validam as mesmas regras, então o mapeamento precisa ser o mesmo:
// antes cada um tinha a sua lista, e um erro fora dela virava 400 num e 500
// no outro.
func writePrayerWriteError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, repositories.ErrGroupAccessDenied):
		shared.WriteError(w, http.StatusForbidden, "GROUP_ACCESS_DENIED", "You can only post to groups where you are a member", nil)
	case errors.Is(err, repositories.ErrPrayerRequestNotFound):
		shared.WriteError(w, http.StatusNotFound, "REQUEST_NOT_FOUND", "Prayer request not found", nil)
	case errors.Is(err, services.ErrInvalidTitle),
		errors.Is(err, services.ErrInvalidBody),
		errors.Is(err, services.ErrInvalidCategory),
		errors.Is(err, services.ErrInvalidVisibility),
		errors.Is(err, services.ErrGroupIDsRequired),
		errors.Is(err, services.ErrPrivateCannotHaveGroups):
		shared.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error(), nil)
	default:
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
	}
}

func (h *PrayerHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	requestID := chi.URLParam(r, "id")
	prayer, err := h.service.GetPrayerRequestByID(r.Context(), userID, requestID)
	if err != nil {
		if errors.Is(err, repositories.ErrPrayerRequestNotFound) {
			shared.WriteError(w, http.StatusNotFound, "REQUEST_NOT_FOUND", "Prayer request not found", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, prayer)
}

func (h *PrayerHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}

	var req updatePrayerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		shared.WriteError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload", nil)
		return
	}

	prayer, err := h.service.UpdatePrayerRequest(r.Context(), models.UpdatePrayerRequestInput{
		RequestID:      chi.URLParam(r, "id"),
		EditorID:       userID,
		Title:          req.Title,
		Body:           req.Body,
		Category:       models.PrayerCategory(req.Category),
		Visibility:     models.Visibility(req.Visibility),
		AllowAnonymous: req.AllowAnonymous,
		GroupIDs:       req.GroupIDs,
	})
	if err != nil {
		writePrayerWriteError(w, err)
		return
	}
	shared.WriteJSON(w, http.StatusOK, prayer)
}

func (h *PrayerHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	requestID := chi.URLParam(r, "id")
	err := h.service.DeletePrayerRequest(r.Context(), userID, requestID)
	if err != nil {
		if errors.Is(err, repositories.ErrPrayerRequestNotFound) {
			shared.WriteError(w, http.StatusNotFound, "REQUEST_NOT_FOUND", "Prayer request not found", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"status": "deleted"})
}

type answerRequest struct {
	Testimony string `json:"testimony"`
}

func (h *PrayerHandler) Answer(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	var req answerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && err != io.EOF {
		shared.WriteError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload", nil)
		return
	}
	prayer, err := h.service.AnswerPrayerRequest(r.Context(), models.AnswerPrayerRequestInput{
		RequestID:   chi.URLParam(r, "id"),
		ActorUserID: userID,
		Testimony:   req.Testimony,
	})
	if err != nil {
		if errors.Is(err, repositories.ErrPrayerRequestNotFound) {
			shared.WriteError(w, http.StatusNotFound, "REQUEST_NOT_FOUND", "Prayer request not found", nil)
			return
		}
		if errors.Is(err, services.ErrPermissionDenied) {
			shared.WriteError(w, http.StatusForbidden, "FORBIDDEN", "Only the author can mark a request as answered", nil)
			return
		}
		if errors.Is(err, services.ErrInvalidUpdateBody) {
			shared.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Testimony must be at most 2000 characters", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, prayer)
}

func (h *PrayerHandler) Unanswer(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	prayer, err := h.service.UnanswerPrayerRequest(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		if errors.Is(err, repositories.ErrPrayerRequestNotFound) {
			shared.WriteError(w, http.StatusNotFound, "REQUEST_NOT_FOUND", "Prayer request not found", nil)
			return
		}
		if errors.Is(err, services.ErrPermissionDenied) {
			shared.WriteError(w, http.StatusForbidden, "FORBIDDEN", "Only the author can change this", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, prayer)
}

func (h *PrayerHandler) ListActions(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	requestID := chi.URLParam(r, "id")
	items, err := h.service.ListPrayerActionsByRequest(r.Context(), userID, requestID)
	if err != nil {
		if errors.Is(err, repositories.ErrPrayerRequestNotFound) {
			shared.WriteError(w, http.StatusNotFound, "REQUEST_NOT_FOUND", "Prayer request not found", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

type createUpdateRequest struct {
	Body string `json:"body"`
}

func (h *PrayerHandler) CreateUpdate(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	requestID := chi.URLParam(r, "id")
	var req createUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		shared.WriteError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload", nil)
		return
	}
	out, err := h.service.CreatePrayerRequestUpdate(r.Context(), userID, requestID, req.Body)
	if err != nil {
		if errors.Is(err, repositories.ErrPrayerRequestNotFound) {
			shared.WriteError(w, http.StatusNotFound, "REQUEST_NOT_FOUND", "Prayer request not found", nil)
			return
		}
		if errors.Is(err, services.ErrPermissionDenied) {
			shared.WriteError(w, http.StatusForbidden, "FORBIDDEN", "Only the author can publish updates", nil)
			return
		}
		if errors.Is(err, services.ErrInvalidUpdateBody) {
			shared.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Update body must be 1-2000 characters", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusCreated, out)
}

func (h *PrayerHandler) ListUpdates(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	requestID := chi.URLParam(r, "id")
	items, err := h.service.ListPrayerRequestUpdates(r.Context(), userID, requestID)
	if err != nil {
		if errors.Is(err, repositories.ErrPrayerRequestNotFound) {
			shared.WriteError(w, http.StatusNotFound, "REQUEST_NOT_FOUND", "Prayer request not found", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

func (h *PrayerHandler) Pray(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	requestID := chi.URLParam(r, "id")
	var req prayRequest
	_ = json.NewDecoder(r.Body).Decode(&req)
	// actionType vazio é resolvido no service, que já carrega o usuário.
	err := h.service.RecordPrayerAction(r.Context(), userID, requestID, models.PrayerActionType(req.ActionType), h.prayedWindowHour)
	if err != nil {
		if errors.Is(err, repositories.ErrPrayerRequestNotFound) {
			shared.WriteError(w, http.StatusNotFound, "REQUEST_NOT_FOUND", "Prayer request not found", nil)
			return
		}
		if errors.Is(err, repositories.ErrDuplicatePrayedAction) {
			shared.WriteError(w, http.StatusTooManyRequests, "PRAYED_RATE_LIMITED", "You can pray again later for this request", nil)
			return
		}
		if errors.Is(err, services.ErrInvalidPrayerActionType) {
			shared.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", "Invalid prayer action type", nil)
			return
		}
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"status": "recorded"})
}
