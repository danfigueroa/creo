package middleware

import (
	"fmt"
	"net/http"
	"sync/atomic"
	"time"

	appdb "parish-viva/backend/internal/db"

	"go.uber.org/zap"
)

// served vira true na primeira requisição do processo. Na Vercel cada instância
// nova começa do zero (sem conexão no pool, sem JWKS em cache), então marcar a
// primeira requisição separa o custo de cold start do custo normal.
var served atomic.Bool

func Logging(logger *zap.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			coldStart := !served.Swap(true)
			ctx, dbStats := appdb.WithStats(r.Context())
			ww := &statusWriter{ResponseWriter: w, status: http.StatusOK}
			// Server-Timing aparece na aba Timing do DevTools e separa o tempo
			// gasto no servidor do tempo de rede até ele. Precisa sair antes do
			// primeiro byte, então mede até o momento em que o handler responde.
			ww.beforeHeader = func() {
				roundTrips, _, dbDuration := dbStats.Snapshot()
				value := fmt.Sprintf(`app;dur=%.1f, db;dur=%.1f;desc="%d rt"`,
					ms(time.Since(start)), ms(dbDuration), roundTrips)
				if coldStart {
					value += `, cold;desc="cold start"`
				}
				w.Header().Set("Server-Timing", value)
			}
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
				zap.Bool("coldStart", coldStart),
			)
		})
	}
}

func ms(d time.Duration) float64 {
	return float64(d.Microseconds()) / 1000
}

type statusWriter struct {
	http.ResponseWriter
	status       int
	wroteHeader  bool
	beforeHeader func()
}

func (w *statusWriter) WriteHeader(code int) {
	if !w.wroteHeader {
		w.wroteHeader = true
		if w.beforeHeader != nil {
			w.beforeHeader()
		}
	}
	w.status = code
	w.ResponseWriter.WriteHeader(code)
}

func (w *statusWriter) Write(b []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(b)
}
