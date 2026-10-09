package middleware

import (
	"net/http"
	"strings"
)

// SecurityHeaders vale para as respostas da API. A Swagger UI em /docs carrega
// script e estilo próprios, então fica fora da CSP restritiva.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "no-referrer")
		if !strings.HasPrefix(r.URL.Path, "/docs") {
			h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		}
		next.ServeHTTP(w, r)
	})
}
