package middleware

import "net/http"

// MaxBodyBytes cobre o maior payload legítimo (pedido de 4000 caracteres em
// UTF-8 multibyte) com folga. Acima disso o decode falha e o handler responde
// INVALID_JSON.
const MaxBodyBytes = 64 << 10

func BodyLimit(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Body != nil {
			r.Body = http.MaxBytesReader(w, r.Body, MaxBodyBytes)
		}
		next.ServeHTTP(w, r)
	})
}
