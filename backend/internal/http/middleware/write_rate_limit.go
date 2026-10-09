package middleware

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/httprate"
)

// WriteRateLimit freia escrita (POST/PATCH/DELETE) por usuário, em cima do
// limite global por IP. O contador vive na memória da instância: na Vercel
// cada instância conta sozinha, então é um freio de melhor esforço contra
// script em loop, não uma cota exata.
func WriteRateLimit(requests int, window time.Duration) func(http.Handler) http.Handler {
	limiter := httprate.Limit(requests, window,
		httprate.WithKeyFuncs(func(r *http.Request) (string, error) {
			if id := GetString(r.Context(), ContextKeyUserID); id != "" {
				return "u:" + id, nil
			}
			return httprate.KeyByIP(r)
		}),
		httprate.WithLimitHandler(func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusTooManyRequests)
			_ = json.NewEncoder(w).Encode(map[string]any{
				"error": map[string]any{
					"code":    "RATE_LIMITED",
					"message": "Too many requests, try again in a moment",
				},
			})
		}),
	)
	return func(next http.Handler) http.Handler {
		limited := limiter(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			switch r.Method {
			case http.MethodPost, http.MethodPatch, http.MethodPut, http.MethodDelete:
				limited.ServeHTTP(w, r)
			default:
				next.ServeHTTP(w, r)
			}
		})
	}
}
