package repositories

import (
	"context"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
)

// ErrSoleAdmin: a conta é a única admin de grupos que ainda têm outros
// membros. Excluir deixaria esses grupos sem ninguém que os administre.
var ErrSoleAdmin = errors.New("sole admin of groups with members")

type GroupRef struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// SoleAdminError carrega os grupos para o front dizer onde transferir a
// administração antes de excluir.
type SoleAdminError struct {
	Groups []GroupRef
}

func (e *SoleAdminError) Error() string { return ErrSoleAdmin.Error() }
func (e *SoleAdminError) Unwrap() error { return ErrSoleAdmin }

// exportUserDataSQL monta o JSON inteiro num statement só (uma viagem). Leva
// só o que é do titular: perfil, conteúdo que escreveu, reações que deu,
// vínculos e notificações recebidas. Inclui conteúdo já apagado (deleted_at),
// porque ele ainda está guardado.
const exportUserDataSQL = `
SELECT json_build_object(
  'exportedAt', NOW(),
  'profile', (
    SELECT row_to_json(p) FROM (
      SELECT id, email, username, display_name AS "displayName", bio, avatar_url AS "avatarUrl",
             tradition, language, email_notifications_enabled AS "emailNotifications",
             in_app_notifications_enabled AS "inAppNotifications", created_at AS "createdAt"
      FROM users WHERE id = $1
    ) p
  ),
  'prayerRequests', (
    SELECT COALESCE(json_agg(r ORDER BY r."createdAt"), '[]'::json) FROM (
      SELECT pr.id, pr.title, pr.body, pr.category, pr.visibility, pr.allow_anonymous AS "anonymous",
             pr.status, pr.tradition, pr.prayed_count AS "prayedCount", pr.testimony,
             pr.answered_at AS "answeredAt", pr.created_at AS "createdAt", pr.deleted_at AS "deletedAt",
             (SELECT COALESCE(json_agg(json_build_object('body', u.body, 'createdAt', u.created_at) ORDER BY u.created_at), '[]'::json)
                FROM prayer_request_updates u WHERE u.prayer_request_id = pr.id AND u.author_id = $1) AS updates
      FROM prayer_requests pr WHERE pr.author_id = $1
    ) r
  ),
  'announcements', (
    SELECT COALESCE(json_agg(a ORDER BY a."createdAt"), '[]'::json) FROM (
      SELECT ga.id, g.name AS "group", ga.title, ga.body, ga.event_at AS "eventAt", ga.image_url AS "imageUrl",
             ga.created_at AS "createdAt", ga.deleted_at AS "deletedAt"
      FROM group_announcements ga JOIN groups g ON g.id = ga.group_id
      WHERE ga.author_id = $1
    ) a
  ),
  'verseShares', (
    SELECT COALESCE(json_agg(v ORDER BY v."createdAt"), '[]'::json) FROM (
      SELECT vs.id, bv.book_name || ' ' || bv.chapter || ':' || bv.verse AS reference, vs.comment,
             vs.visibility, vs.created_at AS "createdAt", vs.deleted_at AS "deletedAt"
      FROM verse_shares vs JOIN bible_verses bv ON bv.id = vs.verse_id
      WHERE vs.author_id = $1
    ) v
  ),
  'reactions', (
    SELECT COALESCE(json_agg(x ORDER BY x."createdAt"), '[]'::json) FROM (
      SELECT pa.action_type AS type, pa.prayer_request_id AS "prayerRequestId",
             pa.verse_share_id AS "verseShareId", pa.created_at AS "createdAt"
      FROM prayer_actions pa WHERE pa.user_id = $1
    ) x
  ),
  'friends', (
    SELECT COALESCE(json_agg(f ORDER BY f."since"), '[]'::json) FROM (
      SELECT u.username, u.display_name AS "displayName", fs.status,
             CASE WHEN fs.user_id = $1 THEN 'SENT' ELSE 'RECEIVED' END AS direction,
             fs.created_at AS "since"
      FROM friendships fs
      JOIN users u ON u.id = CASE WHEN fs.user_id = $1 THEN fs.friend_user_id ELSE fs.user_id END
      WHERE fs.user_id = $1 OR fs.friend_user_id = $1
    ) f
  ),
  'groups', (
    SELECT COALESCE(json_agg(gm ORDER BY gm."joinedAt"), '[]'::json) FROM (
      SELECT g.id, g.name, m.role, m.created_at AS "joinedAt", m.deleted_at AS "leftAt"
      FROM group_memberships m JOIN groups g ON g.id = m.group_id
      WHERE m.user_id = $1
    ) gm
  ),
  'blockedUsers', (
    SELECT COALESCE(json_agg(b ORDER BY b."blockedAt"), '[]'::json) FROM (
      SELECT u.username, ub.created_at AS "blockedAt"
      FROM user_blocks ub JOIN users u ON u.id = ub.blocked_user_id
      WHERE ub.blocker_user_id = $1
    ) b
  ),
  'notifications', (
    SELECT COALESCE(json_agg(n ORDER BY n."createdAt"), '[]'::json) FROM (
      SELECT type, subject_type AS "subjectType", subject_id AS "subjectId",
             read_at AS "readAt", created_at AS "createdAt"
      FROM notifications WHERE user_id = $1
    ) n
  )
)`

func (r *PostgresRepository) ExportUserData(ctx context.Context, userID string) (json.RawMessage, error) {
	var out []byte
	if err := r.db.QueryRow(ctx, exportUserDataSQL, userID).Scan(&out); err != nil {
		return nil, err
	}
	return out, nil
}

// soleAdminGroupsSQL lista os grupos em que a conta é a única admin ativa,
// com quantos outros membros ativos cada um tem.
const soleAdminGroupsSQL = `
SELECT g.id::text, g.name,
       (SELECT COUNT(*) FROM group_memberships o
         WHERE o.group_id = g.id AND o.user_id <> $1 AND o.deleted_at IS NULL) AS others
FROM group_memberships m
JOIN groups g ON g.id = m.group_id AND g.deleted_at IS NULL
WHERE m.user_id = $1 AND m.role = 'ADMIN' AND m.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM group_memberships a
    WHERE a.group_id = g.id AND a.user_id <> $1 AND a.role = 'ADMIN' AND a.deleted_at IS NULL
  )`

// DeleteAccount apaga o conteúdo e anonimiza a linha de users numa transação.
// beforeCommit roda com a transação ainda aberta (é onde o service remove o
// usuário do Supabase Auth): se ele falhar, nada aqui é gravado e a conta
// continua inteira, em vez de ficar meio apagada.
//
// A linha de users fica (anonimizada) porque reações, moderação e
// notificações de terceiros apontam para ela sem ON DELETE CASCADE.
func (r *PostgresRepository) DeleteAccount(ctx context.Context, userID string, beforeCommit func(context.Context) error) error {
	tx, err := r.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, soleAdminGroupsSQL, userID)
	if err != nil {
		return err
	}
	var blocking []GroupRef
	var solo []string
	for rows.Next() {
		var ref GroupRef
		var others int
		if err := rows.Scan(&ref.ID, &ref.Name, &others); err != nil {
			rows.Close()
			return err
		}
		if others > 0 {
			blocking = append(blocking, ref)
		} else {
			solo = append(solo, ref.ID)
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if len(blocking) > 0 {
		return &SoleAdminError{Groups: blocking}
	}

	b := &pgx.Batch{}
	// Grupo em que a conta era a única pessoa some junto.
	b.Queue(`UPDATE groups SET deleted_at = NOW(), updated_at = NOW() WHERE id::text = ANY($1) AND deleted_at IS NULL`, solo)
	// Conteúdo: soft delete para não quebrar as FKs, e o texto é apagado de
	// fato — soft delete sozinho deixaria o pedido guardado.
	b.Queue(`UPDATE prayer_requests
	         SET deleted_at = COALESCE(deleted_at, NOW()), title = '[removido]', body = '[removido]',
	             testimony = NULL, updated_at = NOW()
	         WHERE author_id = $1`, userID)
	b.Queue(`DELETE FROM prayer_request_updates WHERE author_id = $1`, userID)
	b.Queue(`UPDATE group_announcements
	         SET deleted_at = COALESCE(deleted_at, NOW()), title = '[removido]', body = '[removido]',
	             image_url = NULL, updated_at = NOW()
	         WHERE author_id = $1`, userID)
	b.Queue(`UPDATE verse_shares SET deleted_at = COALESCE(deleted_at, NOW()), comment = NULL, updated_at = NOW()
	         WHERE author_id = $1`, userID)
	b.Queue(`UPDATE group_memberships SET deleted_at = NOW(), updated_at = NOW() WHERE user_id = $1 AND deleted_at IS NULL`, userID)
	b.Queue(`DELETE FROM group_join_requests WHERE user_id = $1 AND status = 'PENDING'`, userID)
	b.Queue(`DELETE FROM friendships WHERE user_id = $1 OR friend_user_id = $1`, userID)
	b.Queue(`DELETE FROM user_blocks WHERE blocker_user_id = $1 OR blocked_user_id = $1`, userID)
	b.Queue(`DELETE FROM notifications WHERE user_id = $1 OR actor_user_id = $1`, userID)
	// O e-mail precisa sair (é UNIQUE): sem isso a pessoa não conseguiria
	// criar uma conta nova com o mesmo endereço.
	b.Queue(`UPDATE users
	         SET deleted_at = NOW(),
	             display_name = 'Conta excluída',
	             username = 'excluido_' || SUBSTRING(REPLACE(id::text, '-', ''), 1, 12),
	             email = id::text || '@deleted.local',
	             avatar_url = NULL,
	             bio = NULL,
	             email_notifications_enabled = false,
	             in_app_notifications_enabled = false,
	             updated_at = NOW()
	         WHERE id = $1`, userID)
	if err := tx.SendBatch(ctx, b).Close(); err != nil {
		return err
	}

	if beforeCommit != nil {
		if err := beforeCommit(ctx); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}
