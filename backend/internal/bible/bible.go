// Package bible resolve o texto de um versículo a partir da sua referência.
//
// O catálogo de referências curadas vive no banco (tabela bible_verses); este
// pacote só cuida da parte que nenhuma curadoria resolve: buscar o texto. Ele é
// a única dependência de rede externa do backend e fica atrás de uma interface
// justamente para que services não conheça HTTP nem o formato de nenhuma API.
package bible

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"golang.org/x/sync/singleflight"
)

// ErrVerseUnavailable indica que o texto não pôde ser obtido: rede fora,
// resposta inesperada, ou referência que a tradução não cobre (é o caso dos
// deuterocanônicos nas traduções pt-BR gratuitas). Quem chama deve degradar
// exibindo apenas a referência, nunca falhar a requisição inteira.
var ErrVerseUnavailable = errors.New("bible: verse text unavailable")

// Reference identifica um versículo canônico. BookSlug é a chave do livro na
// API de texto (ex.: "john", "1 samuel"), não o nome de exibição.
type Reference struct {
	BookSlug string
	Chapter  int
	Verse    int
}

// String devolve a referência no formato aceito pela API ("john 3:16").
func (r Reference) String() string {
	return fmt.Sprintf("%s %d:%d", r.BookSlug, r.Chapter, r.Verse)
}

// TextProvider busca o texto de um versículo numa tradução.
// Implementações devem ser seguras para uso concorrente.
type TextProvider interface {
	Fetch(ctx context.Context, ref Reference, translation string) (string, error)
}

// HTTPProvider busca o texto numa API pública compatível com bible-api.com.
//
// O texto é persistido pelo chamador na primeira leitura, então na prática esta
// implementação é exercitada uma vez por versículo do catálogo e depois sai do
// caminho quente do feed.
type HTTPProvider struct {
	baseURL string
	client  *http.Client
	group   singleflight.Group
}

// NewHTTPProvider monta um provider apontado para baseURL (ex.:
// "https://bible-api.com"). Um timeout <= 0 cai no default de 3s, curto de
// propósito: a resposta do versículo do dia não pode ficar presa num terceiro.
func NewHTTPProvider(baseURL string, timeout time.Duration) *HTTPProvider {
	if timeout <= 0 {
		timeout = 3 * time.Second
	}
	return &HTTPProvider{
		baseURL: strings.TrimRight(baseURL, "/"),
		client:  &http.Client{Timeout: timeout},
	}
}

// apiResponse cobre só o que interessa do payload do bible-api.com.
type apiResponse struct {
	Reference string `json:"reference"`
	Text      string `json:"text"`
	Verses    []struct {
		Text string `json:"text"`
	} `json:"verses"`
}

// Fetch implementa TextProvider. Chamadas concorrentes para a mesma referência
// são colapsadas numa única ida à rede — no primeiro acesso do dia vários
// usuários podem cair no mesmo versículo ao mesmo tempo.
func (p *HTTPProvider) Fetch(ctx context.Context, ref Reference, translation string) (string, error) {
	if p.baseURL == "" {
		return "", fmt.Errorf("%w: base URL não configurada", ErrVerseUnavailable)
	}
	key := ref.String() + "|" + translation
	text, err, _ := p.group.Do(key, func() (any, error) {
		return p.fetch(ctx, ref, translation)
	})
	if err != nil {
		return "", err
	}
	return text.(string), nil
}

func (p *HTTPProvider) fetch(ctx context.Context, ref Reference, translation string) (string, error) {
	endpoint := p.baseURL + "/" + url.PathEscape(ref.String())
	if translation != "" {
		endpoint += "?translation=" + url.QueryEscape(translation)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrVerseUnavailable, err)
	}
	req.Header.Set("Accept", "application/json")

	res, err := p.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrVerseUnavailable, err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("%w: status %d para %s", ErrVerseUnavailable, res.StatusCode, ref)
	}

	var payload apiResponse
	if err := json.NewDecoder(res.Body).Decode(&payload); err != nil {
		return "", fmt.Errorf("%w: resposta ilegível: %v", ErrVerseUnavailable, err)
	}

	text := strings.TrimSpace(payload.Text)
	if text == "" && len(payload.Verses) > 0 {
		text = strings.TrimSpace(payload.Verses[0].Text)
	}
	if text == "" {
		return "", fmt.Errorf("%w: resposta sem texto para %s", ErrVerseUnavailable, ref)
	}
	return normalizeText(text), nil
}

// normalizeText colapsa as quebras de linha que a API insere no meio do
// versículo — no card do feed o texto é um parágrafo só.
func normalizeText(text string) string {
	return strings.Join(strings.Fields(text), " ")
}

// StaticProvider serve textos de um mapa em memória, chaveado por
// Reference.String(). Serve para desenvolvimento offline e para exercitar o
// service sem depender de rede.
type StaticProvider struct {
	Texts map[string]string
}

// Fetch implementa TextProvider.
func (p *StaticProvider) Fetch(_ context.Context, ref Reference, _ string) (string, error) {
	if text, ok := p.Texts[ref.String()]; ok {
		return text, nil
	}
	return "", fmt.Errorf("%w: %s ausente do provider estático", ErrVerseUnavailable, ref)
}
