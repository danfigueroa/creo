package handlers

import (
	"errors"
	"net/http"

	"parish-viva/backend/internal/http/middleware"
	"parish-viva/backend/internal/http/shared"
	"parish-viva/backend/internal/repositories"
	"parish-viva/backend/internal/services"
	"parish-viva/backend/internal/supabaseadmin"
)

// AccountHandler cuida dos direitos do titular (LGPD): exportar e excluir.
type AccountHandler struct {
	service *services.Service
}

func NewAccountHandler(service *services.Service) *AccountHandler {
	return &AccountHandler{service: service}
}

func (h *AccountHandler) Export(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		writeAuthSyncError(w, err)
		return
	}
	data, err := h.service.ExportUserData(r.Context(), userID)
	if err != nil {
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="creo-dados.json"`)
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

func (h *AccountHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	if err := ensureAuthUser(h.service, r); err != nil {
		writeAuthSyncError(w, err)
		return
	}
	err := h.service.DeleteAccount(r.Context(), userID)
	var soleAdmin *repositories.SoleAdminError
	switch {
	case err == nil:
		w.WriteHeader(http.StatusNoContent)
	case errors.As(err, &soleAdmin):
		shared.WriteError(w, http.StatusConflict, "LAST_ADMIN", "Transfer admin rights before deleting the account", map[string]any{
			"groups": soleAdmin.Groups,
		})
	case errors.Is(err, supabaseadmin.ErrNotConfigured):
		shared.WriteError(w, http.StatusServiceUnavailable, "ACCOUNT_DELETION_UNAVAILABLE", "Account deletion is not configured", nil)
	default:
		shared.WriteError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "Unexpected error", nil)
	}
}
