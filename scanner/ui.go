package scanner

import (
	_ "embed"
	"net/http"
	"strings"
	"sync"
)

//go:embed ui/index.html
var uiIndexHTML []byte

//go:embed ui/style.css
var uiStyleCSS []byte

//go:embed ui/app.js
var uiAppJS []byte

var (
	bundleOnce sync.Once
	bundledUI  []byte
)

// getBundledUI inlines CSS and JS into index.html so serving from Encore
// has zero asset roundtrip latency and avoids any static file routing pitfalls.
func getBundledUI() []byte {
	bundleOnce.Do(func() {
		content := string(uiIndexHTML)
		content = strings.Replace(content, `<link rel="stylesheet" href="style.css">`, `<style>`+string(uiStyleCSS)+`</style>`, 1)
		content = strings.Replace(content, `<script src="app.js"></script>`, `<script>`+string(uiAppJS)+`</script>`, 1)
		bundledUI = []byte(content)
	})
	return bundledUI
}

// ServeRoot serves the application management dashboard when no other API route matches (including the root URL /).
//
//encore:api public raw path=/!fallback
func ServeRoot(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(getBundledUI())
}

// ServeUIExact serves the application management dashboard at /ui.
//
//encore:api public raw path=/ui
func ServeUIExact(w http.ResponseWriter, req *http.Request) {
	ServeRoot(w, req)
}

// ServeUI serves the application management dashboard at /ui/*path.
//
//encore:api public raw path=/ui/*path
func ServeUI(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(getBundledUI())
}
