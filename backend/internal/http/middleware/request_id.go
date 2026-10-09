package middleware

import (
	"net/http"
	"regexp"

	"github.com/google/uuid"
)

// O id do cliente vai para o log e volta no header; fora deste formato ele
// permitiria forjar ou quebrar linhas de log.
var requestIDPattern = regexp.MustCompile(`^[A-Za-z0-9-]{1,64}$`)

func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestID := r.Header.Get("X-Request-Id")
		if !requestIDPattern.MatchString(requestID) {
			requestID = uuid.NewString()
		}
		w.Header().Set("X-Request-Id", requestID)
		ctx := SetContextValue(r.Context(), ContextKeyRequestID, requestID)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
