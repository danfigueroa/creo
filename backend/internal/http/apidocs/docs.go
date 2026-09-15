// Package apidocs serve a documentação da API: o spec OpenAPI escrito à mão e uma
// Swagger UI que o consome. Os arquivos vão embutidos no binário porque a
// função da Vercel não carrega arquivos soltos do repositório.
package apidocs

import (
	_ "embed"
	"net/http"
)

//go:embed openapi.yaml
var spec []byte

//go:embed index.html
var page []byte

// UI responde a página da Swagger UI.
func UI(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write(page)
}

// Spec responde o openapi.yaml.
func Spec(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "application/yaml")
	_, _ = w.Write(spec)
}
