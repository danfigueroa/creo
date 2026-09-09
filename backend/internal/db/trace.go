// Package db traz a instrumentação de acesso ao banco.
//
// A métrica que importa neste projeto é a quantidade de idas e voltas ao
// Postgres, não o tempo de cada query: o banco responde em tempo desprezível no
// volume atual, e o custo real é a latência de rede até o Supabase. Por isso um
// batch conta como UMA ida, independente de quantos statements carregue — é
// exatamente essa a diferença que as otimizações precisam mostrar.
package db

import (
	"context"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
)

// Stats acumula as idas ao banco de uma requisição. É seguro para uso
// concorrente porque as queries de uma mesma requisição podem rodar em paralelo.
type Stats struct {
	mu        sync.Mutex
	roundTrip int
	statement int
	duration  time.Duration
}

func (s *Stats) add(statements int, elapsed time.Duration) {
	if s == nil {
		return
	}
	s.mu.Lock()
	s.roundTrip++
	s.statement += statements
	s.duration += elapsed
	s.mu.Unlock()
}

// RoundTrips é o número de idas ao banco; Statements conta os comandos enviados
// (maior que RoundTrips quando há batch). Duration é o tempo somado, que sob
// paralelismo pode passar do tempo total da requisição.
func (s *Stats) Snapshot() (roundTrips, statements int, duration time.Duration) {
	if s == nil {
		return 0, 0, 0
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.roundTrip, s.statement, s.duration
}

type statsKey struct{}

type startKey struct{}

// WithStats devolve um contexto que acumula as idas ao banco feitas a partir
// dele. O middleware de logging injeta um por requisição.
func WithStats(ctx context.Context) (context.Context, *Stats) {
	stats := &Stats{}
	return context.WithValue(ctx, statsKey{}, stats), stats
}

func statsFrom(ctx context.Context) *Stats {
	stats, _ := ctx.Value(statsKey{}).(*Stats)
	return stats
}

// Tracer implementa pgx.QueryTracer e pgx.BatchTracer. Quando não há Stats no
// contexto (startup, scripts, jobs), não faz nada.
type Tracer struct{}

var (
	_ pgx.QueryTracer = Tracer{}
	_ pgx.BatchTracer = Tracer{}
)

func (Tracer) TraceQueryStart(ctx context.Context, _ *pgx.Conn, _ pgx.TraceQueryStartData) context.Context {
	return context.WithValue(ctx, startKey{}, time.Now())
}

func (Tracer) TraceQueryEnd(ctx context.Context, _ *pgx.Conn, _ pgx.TraceQueryEndData) {
	statsFrom(ctx).add(1, elapsedSince(ctx))
}

func (Tracer) TraceBatchStart(ctx context.Context, _ *pgx.Conn, data pgx.TraceBatchStartData) context.Context {
	ctx = context.WithValue(ctx, startKey{}, time.Now())
	return context.WithValue(ctx, batchLenKey{}, data.Batch.Len())
}

// TraceBatchQuery não contabiliza nada: os statements de um batch viajam juntos,
// então cobrá-los individualmente esconderia justamente o ganho.
func (Tracer) TraceBatchQuery(context.Context, *pgx.Conn, pgx.TraceBatchQueryData) {}

func (Tracer) TraceBatchEnd(ctx context.Context, _ *pgx.Conn, _ pgx.TraceBatchEndData) {
	statements, _ := ctx.Value(batchLenKey{}).(int)
	if statements <= 0 {
		statements = 1
	}
	statsFrom(ctx).add(statements, elapsedSince(ctx))
}

type batchLenKey struct{}

func elapsedSince(ctx context.Context) time.Duration {
	start, ok := ctx.Value(startKey{}).(time.Time)
	if !ok {
		return 0
	}
	return time.Since(start)
}
