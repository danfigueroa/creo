// Package supabaseadmin fala com a Admin API do Supabase Auth usando a
// service role key. Só a exclusão de conta precisa disso; a chave nunca sai
// do backend.
package supabaseadmin

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ErrNotConfigured: SUPABASE_SERVICE_ROLE_KEY ausente. O handler responde 503
// em vez de apagar só a metade do banco.
var ErrNotConfigured = errors.New("supabase admin api not configured")

type Client struct {
	baseURL    string
	serviceKey string
	http       *http.Client
}

func New(supabaseURL, serviceKey string) *Client {
	return &Client{
		baseURL:    strings.TrimRight(supabaseURL, "/"),
		serviceKey: serviceKey,
		http:       &http.Client{Timeout: 5 * time.Second},
	}
}

// DeleteUser remove o usuário de auth.users, o que também revoga os refresh
// tokens dele. 404 conta como sucesso: o usuário já não existe.
func (c *Client) DeleteUser(ctx context.Context, userID string) error {
	if c == nil || c.serviceKey == "" || c.baseURL == "" {
		return ErrNotConfigured
	}
	endpoint := c.baseURL + "/auth/v1/admin/users/" + url.PathEscape(userID)
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, endpoint, nil)
	if err != nil {
		return err
	}
	req.Header.Set("apikey", c.serviceKey)
	req.Header.Set("Authorization", "Bearer "+c.serviceKey)
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotFound || (res.StatusCode >= 200 && res.StatusCode < 300) {
		return nil
	}
	return fmt.Errorf("supabase admin delete user: status %d", res.StatusCode)
}
