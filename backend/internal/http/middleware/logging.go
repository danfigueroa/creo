package middleware

import (
	"net/http"
	"time"

	appdb "parish-viva/backend/internal/db"

	"go.uber.org/zap"
)

func Logging(logger *zap.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := &statusWriter{ResponseWriter: w, status: http.StatusOK}
			ctx, dbStats := appdb.WithStats(r.Context())
			next.ServeHTTP(ww, r.WithContext(ctx))
			roundTrips, statements, dbDuration := dbStats.Snapshot()
			logger.Info(
				"http_request",
				zap.String("requestId", GetString(r.Context(), ContextKeyRequestID)),
				zap.String("method", r.Method),
				zap.String("path", r.URL.Path),
				zap.Int("status", ww.status),
				zap.Duration("duration", time.Since(start)),
				// dbRoundTrips é a métrica de otimização; dbStatements mostra
				// quantos comandos couberam nessas viagens.
				zap.Int("dbRoundTrips", roundTrips),
				zap.Int("dbStatements", statements),
				zap.Duration("dbDuration", dbDuration),
			)
		})
	}
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(code int) {
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}
