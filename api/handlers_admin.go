package api

import "net/http"

func (s *Server) registerAdminRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /admin/reset", s.handleReset)
}

// handleReset swaps the entire application state for a freshly built one and
// reports success. The request takes no body.
func (s *Server) handleReset(w http.ResponseWriter, r *http.Request) {
	s.Reset()
	s.log.Info("application state reset")
	writeJSON(w, http.StatusOK, map[string]string{"status": "reset"})
}
