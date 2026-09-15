package middleware

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"parish-viva/backend/internal/http/shared"
)

// uuidParamNames são os parâmetros de rota que carregam IDs do banco. Lista
// explícita, e não "todos exceto username", para que um parâmetro de texto novo
// não seja rejeitado por engano.
var uuidParamNames = map[string]bool{
	"id":        true,
	"userId":    true,
	"requestId": true,
	"aid":       true,
}

// UUIDParams rejeita com 400 um ID de rota mal formado. Sem isso o valor chega
// ao Postgres, que falha no cast para uuid, e a resposta vira 500.
//
// Precisa rodar depois do roteamento, porque só então os parâmetros existem no
// contexto. Isso vale para middleware de Group ou With, que o chi aplica em
// volta do handler final, mas não para o Use de um Route.
func UUIDParams(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if rctx := chi.RouteContext(r.Context()); rctx != nil {
			for i, key := range rctx.URLParams.Keys {
				if !uuidParamNames[key] {
					continue
				}
				if _, err := uuid.Parse(rctx.URLParams.Values[i]); err != nil {
					shared.WriteError(w, http.StatusBadRequest, "INVALID_ID", "Invalid id in path", map[string]any{"param": key})
					return
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}
