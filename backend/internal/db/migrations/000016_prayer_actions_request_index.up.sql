-- Cobre a agregação de reações por pedido usada pelo enrich dos feeds
-- (GROUP BY prayer_request_id, action_type); o índice existente tem prefixo user_id.
CREATE INDEX IF NOT EXISTS idx_prayer_actions_request_type
    ON prayer_actions (prayer_request_id, action_type);
