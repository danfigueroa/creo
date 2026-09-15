package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"parish-viva/backend/internal/http/middleware"
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

// decodeOptionalJSON lê um corpo JSON que pode vir vazio. Corpo ausente deixa v
// com os zero-values (o padrão da rota); corpo mal formado é erro, para que um
// cliente com bug receba 400 em vez de ter o payload ignorado em silêncio.
func decodeOptionalJSON(r *http.Request, v any) error {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil && !errors.Is(err, io.EOF) {
		return err
	}
	return nil
}
