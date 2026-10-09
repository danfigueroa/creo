package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"parish-viva/backend/internal/http/middleware"
	"parish-viva/backend/internal/http/shared"
	"parish-viva/backend/internal/repositories"
	"parish-viva/backend/internal/services"
)

func ensureAuthUser(service *services.Service, r *http.Request) error {
	userID := middleware.GetString(r.Context(), middleware.ContextKeyUserID)
	userEmail := middleware.GetString(r.Context(), middleware.ContextKeyUserEmail)
	username := middleware.GetString(r.Context(), middleware.ContextKeyUsername)
	displayName := middleware.GetString(r.Context(), middleware.ContextKeyDisplayName)
	tradition := middleware.GetString(r.Context(), middleware.ContextKeyTradition)
	return service.EnsureAuthUser(r.Context(), userID, userEmail, username, displayName, tradition)
}

// writeAuthSyncError responde a falha de ensureAuthUser. Conta excluída vira
// 401 ACCOUNT_DELETED: o access token do Supabase continua válido por até 1 h
// depois da exclusão, e o front usa o código para encerrar a sessão.
func writeAuthSyncError(w http.ResponseWriter, err error) {
	if errors.Is(err, repositories.ErrAccountDeleted) {
		shared.WriteError(w, http.StatusUnauthorized, "ACCOUNT_DELETED", "This account was deleted", nil)
		return
	}
	shared.WriteError(w, http.StatusInternalServerError, "USER_SYNC_FAILED", "Could not prepare user profile", nil)
}

// decodeOptionalJSON lê um corpo JSON que pode vir vazio. Corpo ausente deixa v
// com os zero-values (o padrão da rota); corpo mal formado é erro, para que um
// cliente com bug receba 400 em vez de ter o payload ignorado em silêncio.
func decodeOptionalJSON(r *http.Request, v any) error {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil && !errors.Is(err, io.EOF) {
		return err
	}
	return nil
}
