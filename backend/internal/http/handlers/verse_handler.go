package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"parish-viva/backend/internal/http/middleware"
	"parish-viva/backend/internal/http/shared"
	"parish-viva/backend/internal/models"
	"parish-viva/backend/internal/repositories"
	"parish-viva/backend/internal/services"

	"github.com/go-chi/chi/v5"
)

// VerseHandler expõe o versículo do dia e os compartilhamentos no feed.
type VerseHandler struct {
	service          *services.Service
	prayedWindowHour int
}

// NewVerseHandler monta o handler. prayedWindowHour é a janela de dedupe de
// reações, a mesma usada pelos pedidos de oração.
func NewVerseHandler(service *services.Service, prayedWindowHour int) *VerseHandler {
	return &VerseHandler{service: service, prayedWindowHour: prayedWindowHour}
}

type createVerseShareRequest struct {
	VerseID    string   `json:"verseId"`
	Comment    string   `json:"comment"`
	Visibility string   `json:"visibility"`
	GroupIDs   []string `json:"groupIds"`
}

type prayVerseShareRequest struct {
	ActionType string `json:"actionType"`
}

// Today devolve o versículo do dia do usuário autenticado.
//
// Sem Cache-Control: a resposta é personalizada por usuário, então o truque de
// s-maxage do feed público anônimo não se aplica aqui.
func (h *VerseHandler) Today(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	daily, err := h.service.GetDailyVerse(r.Context(), userID)
	if err != nil {
		writeVerseError(w, err)
		return
	}
	shared.WriteJSON(w, http.StatusOK, daily)
}

// CreateShare compartilha um versículo no feed.
func (h *VerseHandler) CreateShare(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	var req createVerseShareRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		shared.WriteError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload", nil)
		return
	}
	share, err := h.service.CreateVerseShare(r.Context(), models.CreateVerseShareInput{
		AuthorID:   userID,
		VerseID:    req.VerseID,
		Comment:    req.Comment,
		Visibility: models.VerseShareVisibility(req.Visibility),
		GroupIDs:   req.GroupIDs,
	})
	if err != nil {
		writeVerseError(w, err)
		return
	}
	shared.WriteJSON(w, http.StatusCreated, share)
}

// GetShare devolve um compartilhamento, respeitando a visibilidade.
// Rota com OptionalAuth: um visitante anônimo só enxerga os PUBLIC.
func (h *VerseHandler) GetShare(w http.ResponseWriter, r *http.Request) {
	viewerUserID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if viewerUserID != "" {
		if err := ensureAuthUser(h.service, r); err != nil {
			shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
			return
		}
	}
	share, err := h.service.GetVerseShare(r.Context(), viewerUserID, chi.URLParam(r, "id"))
	if err != nil {
		writeVerseError(w, err)
		return
	}
	shared.WriteJSON(w, http.StatusOK, share)
}

// DeleteShare apaga um compartilhamento do próprio autor.
func (h *VerseHandler) DeleteShare(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	if err := h.service.DeleteVerseShare(r.Context(), userID, chi.URLParam(r, "id")); err != nil {
		writeVerseError(w, err)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// PrayShare registra uma reação de oração num compartilhamento.
func (h *VerseHandler) PrayShare(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	var req prayVerseShareRequest
	if err := decodeOptionalJSON(r, &req); err != nil {
		shared.WriteError(w, http.StatusBadRequest, "INVALID_JSON", "Invalid JSON payload", nil)
		return
	}
	// actionType vazio é resolvido no service, que já carrega o usuário.
	err := h.service.RecordVerseShareAction(r.Context(), userID, chi.URLParam(r, "id"), models.PrayerActionType(req.ActionType), h.prayedWindowHour)
	if err != nil {
		writeVerseError(w, err)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]string{"status": "recorded"})
}

// ListShareActions lista quem rezou num compartilhamento.
func (h *VerseHandler) ListShareActions(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
		return
	}
	items, err := h.service.ListVerseShareActions(r.Context(), userID, chi.URLParam(r, "id"))
	if err != nil {
		writeVerseError(w, err)
		return
	}
	shared.WriteJSON(w, http.StatusOK, map[string]any{"items": items})
}

// writeVerseError concentra o mapeamento erro -> status/código, no mesmo
// formato de writeAnnouncementError.
func writeVerseError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, repositories.ErrVerseShareNotFound):
		shared.WriteError(w, http.StatusNotFound, "VERSE_SHARE_NOT_FOUND", "Verse share not found", nil)
	case errors.Is(err, repositories.ErrVerseNotFound), errors.Is(err, services.ErrVersePoolEmpty):
		shared.WriteError(w, http.StatusNotFound, "VERSE_NOT_FOUND", "Verse not found", nil)
	case errors.Is(err, repositories.ErrGroupAccessDenied):
		shared.WriteError(w, http.StatusForbidden, "GROUP_ACCESS_DENIED", "You can only share to groups where you are a member", nil)
	case errors.Is(err, services.ErrPermissionDenied):
		shared.WriteError(w, http.StatusForbidden, "FORBIDDEN", "You do not have permission to perform this action", nil)
	case errors.Is(err, services.ErrInvalidVerseComment),
		errors.Is(err, services.ErrInvalidVerseVisibility),
		errors.Is(err, services.ErrVerseGroupIDsRequired),
		errors.Is(err, services.ErrVerseGroupsNotAllowed),
		errors.Is(err, services.ErrInvalidPrayerActionType):
		shared.WriteError(w, http.StatusBadRequest, "VALIDATION_ERROR", err.Error(), nil)
	case errors.Is(err, repositories.ErrDuplicatePrayedAction):
		shared.WriteError(w, http.StatusTooManyRequests, "PRAYED_RATE_LIMITED", "You already prayed for this recently", nil)
	default:
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
	}
}
