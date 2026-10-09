package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	// tzdata embutida: o versículo do dia vira à meia-noite de São Paulo e o
	// runtime da Vercel não garante a base de fusos do sistema.
	_ "time/tzdata"

	"parish-viva/backend/internal/bible"
	"parish-viva/backend/internal/config"
	appdb "parish-viva/backend/internal/db"
	apphttp "parish-viva/backend/internal/http"
	"parish-viva/backend/internal/repositories"
	"parish-viva/backend/internal/services"
	"parish-viva/backend/internal/supabaseadmin"

	"github.com/jackc/pgx/v5/pgxpool"
	"go.uber.org/zap"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		panic(err)
	}

	logger, err := zap.NewProduction()
	if err != nil {
		panic(err)
	}
	defer logger.Sync()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	poolCfg, err := pgxpool.ParseConfig(cfg.DatabaseURL)
	if err != nil {
		logger.Fatal("database_config_invalid", zap.Error(err))
	}
	// Limites explícitos contra o pooler do Supabase (:6543): teto de conexões
	// por instância e reciclagem mais curta que o default de 1h do pgx.
	poolCfg.MaxConns = int32(cfg.DBMaxConns)
	poolCfg.MinConns = int32(cfg.DBMinConns)
	poolCfg.MaxConnLifetime = cfg.DBMaxConnLifetime
	poolCfg.MaxConnIdleTime = cfg.DBMaxConnIdleTime
	// Conta as idas ao banco por requisição. A métrica que interessa aqui é o
	// número de viagens, não o tempo de cada query: o custo é a latência até o
	// Supabase, e um batch viaja uma vez só.
	poolCfg.ConnConfig.Tracer = appdb.Tracer{}

	dbpool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		logger.Fatal("database_connection_failed", zap.Error(err))
	}
	defer dbpool.Close()

	repo := repositories.NewPostgresRepository(dbpool)
	bibleProvider := bible.NewHTTPProvider(cfg.BibleAPIBaseURL, cfg.BibleAPITimeout)
	svc := services.NewService(repo, bibleProvider, cfg.SupabaseURL, supabaseadmin.New(cfg.SupabaseURL, cfg.SupabaseServiceRoleKey))
	router := apphttp.NewRouter(cfg, logger, svc)

	srv := &http.Server{
		Addr:         cfg.HTTPAddr,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Info("api_server_started", zap.String("addr", cfg.HTTPAddr))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatal("api_server_failed", zap.Error(err))
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("api_server_shutdown_failed", zap.Error(err))
	}
}
