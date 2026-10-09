package config

import (
	"errors"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	HTTPAddr          string
	DatabaseURL       string
	DBMaxConns        int
	DBMinConns        int
	DBMaxConnLifetime time.Duration
	DBMaxConnIdleTime time.Duration
	JWTIssuer         string
	JWKSURL           string
	JWKSCacheTTL      time.Duration
	RateLimitRequests int
	RateLimitWindow   time.Duration
	// Escritas por usuário por janela, além do limite global por IP.
	WriteRateLimitRequests int
	// Origem do projeto Supabase (https://<ref>.supabase.co), derivada do
	// JWT_ISSUER. Usada para validar URLs de imagem e chamar a Admin API.
	SupabaseURL string
	// Só a exclusão de conta usa; sem ela, DELETE /me responde 503.
	SupabaseServiceRoleKey string
	PrayedWindowHours      int
	PrayedIPBurstPerHour   int
	CORSAllowedOrigins     []string
	BibleAPIBaseURL        string
	BibleTranslation       string
	BibleAPITimeout        time.Duration
}

func Load() (Config, error) {
	cfg := Config{
		HTTPAddr:               resolveHTTPAddr(),
		DatabaseURL:            os.Getenv("DATABASE_URL"),
		DBMaxConns:             intOrDefault("DB_MAX_CONNS", 8),
		DBMinConns:             intOrDefault("DB_MIN_CONNS", 0),
		DBMaxConnLifetime:      durationOrDefault("DB_MAX_CONN_LIFETIME", 30*time.Minute),
		DBMaxConnIdleTime:      durationOrDefault("DB_MAX_CONN_IDLE_TIME", 5*time.Minute),
		JWTIssuer:              os.Getenv("JWT_ISSUER"),
		JWKSURL:                os.Getenv("JWKS_URL"),
		JWKSCacheTTL:           durationOrDefault("JWKS_CACHE_TTL", 10*time.Minute),
		RateLimitRequests:      intOrDefault("RATE_LIMIT_REQUESTS", 120),
		RateLimitWindow:        durationOrDefault("RATE_LIMIT_WINDOW", time.Minute),
		WriteRateLimitRequests: intOrDefault("WRITE_RATE_LIMIT_REQUESTS", 30),
		SupabaseServiceRoleKey: strings.TrimSpace(os.Getenv("SUPABASE_SERVICE_ROLE_KEY")),
		PrayedWindowHours:      intOrDefault("PRAYED_WINDOW_HOURS", 12),
		PrayedIPBurstPerHour:   intOrDefault("PRAYED_IP_BURST_PER_HOUR", 200),
		CORSAllowedOrigins:     csvOrDefault("CORS_ALLOWED_ORIGINS", []string{"http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"}),
		BibleAPIBaseURL:        envOrDefault("BIBLE_API_BASE_URL", "https://bible-api.com"),
		BibleTranslation:       envOrDefault("BIBLE_TRANSLATION", "almeida"),
		BibleAPITimeout:        durationOrDefault("BIBLE_API_TIMEOUT", 3*time.Second),
	}
	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	if cfg.JWTIssuer == "" {
		return Config{}, errors.New("JWT_ISSUER is required")
	}
	if cfg.JWKSURL == "" {
		return Config{}, errors.New("JWKS_URL is required")
	}
	cfg.SupabaseURL = supabaseOrigin(cfg.JWTIssuer)
	return cfg, nil
}

// supabaseOrigin tira o caminho de "https://<ref>.supabase.co/auth/v1".
func supabaseOrigin(issuer string) string {
	u, err := url.Parse(strings.TrimSpace(issuer))
	if err != nil || u.Scheme == "" || u.Host == "" {
		return ""
	}
	return u.Scheme + "://" + u.Host
}

func resolveHTTPAddr() string {
	if addr := strings.TrimSpace(os.Getenv("HTTP_ADDR")); addr != "" {
		return addr
	}
	if port := strings.TrimSpace(os.Getenv("PORT")); port != "" {
		return ":" + port
	}
	return ":8080"
}

func envOrDefault(key, value string) string {
	v := os.Getenv(key)
	if v == "" {
		return value
	}
	return v
}

func intOrDefault(key string, value int) int {
	v := os.Getenv(key)
	if v == "" {
		return value
	}
	i, err := strconv.Atoi(v)
	if err != nil {
		return value
	}
	return i
}

func durationOrDefault(key string, value time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return value
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return value
	}
	return d
}

func csvOrDefault(key string, value []string) []string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return value
	}
	items := strings.Split(v, ",")
	out := make([]string, 0, len(items))
	for _, item := range items {
		trimmed := strings.TrimSpace(item)
		if trimmed != "" {
			out = append(out, trimmed)
		}
	}
	if len(out) == 0 {
		return value
	}
	return out
}
