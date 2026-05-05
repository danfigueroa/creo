package http

import (
	"net/http"

	"parish-viva/backend/internal/auth"
	"parish-viva/backend/internal/config"
	"parish-viva/backend/internal/http/handlers"
	"parish-viva/backend/internal/http/middleware"
	"parish-viva/backend/internal/services"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/httprate"
	"go.uber.org/zap"
)

func NewRouter(cfg config.Config, logger *zap.Logger, service *services.Service) http.Handler {
	r := chi.NewRouter()
	validator := auth.NewValidator(cfg.JWTIssuer, cfg.JWKSURL, cfg.JWKSCacheTTL)

	healthHandler := handlers.NewHealthHandler()
	profileHandler := handlers.NewProfileHandler(service)
	prayerHandler := handlers.NewPrayerHandler(service, cfg.PrayedWindowHours)
	moderationHandler := handlers.NewModerationHandler(service)
	groupHandler := handlers.NewGroupHandler(service)
	friendHandler := handlers.NewFriendHandler(service)
	blockHandler := handlers.NewBlockHandler(service)
	notificationHandler := handlers.NewNotificationHandler(service)

	r.Use(chimiddleware.Recoverer)
	r.Use(middleware.RequestID)
	r.Use(middleware.Logging(logger))
	r.Use(middleware.CORS(cfg.CORSAllowedOrigins))
	r.Use(httprate.LimitByIP(cfg.RateLimitRequests, cfg.RateLimitWindow))

	r.Get("/health", healthHandler.GetHealth)

	r.Route("/api/v1", func(api chi.Router) {
		api.With(middleware.OptionalAuth(validator)).Get("/feed", prayerHandler.ListPublic)
		api.With(middleware.OptionalAuth(validator)).Get("/feed/public", prayerHandler.ListPublic)
		api.Get("/username-availability", profileHandler.UsernameAvailability)

		api.Group(func(protected chi.Router) {
			protected.Use(middleware.RequireAuth(validator))
			protected.Get("/profile", profileHandler.GetProfile)
			protected.Patch("/profile", profileHandler.UpdateProfile)
			protected.Patch("/profile/tradition", profileHandler.UpdateTradition)
			protected.Get("/users/{username}", profileHandler.GetPublicProfile)
			protected.Get("/feed/home", prayerHandler.ListHome)
			protected.Get("/feed/groups", prayerHandler.ListGroupsFeed)
			protected.Get("/feed/friends", prayerHandler.ListFriendsFeed)
			protected.Get("/groups", groupHandler.ListMine)
			protected.Get("/groups/search", groupHandler.Search)
			protected.Post("/groups", groupHandler.Create)
			protected.Get("/groups/{id}", groupHandler.GetDetails)
			protected.Patch("/groups/{id}", groupHandler.Update)
			protected.Get("/groups/{id}/feed", groupHandler.ListGroupFeed)
			protected.Get("/groups/{id}/members", groupHandler.ListMembers)
			protected.Patch("/groups/{id}/members/{userId}", groupHandler.ChangeMemberRole)
			protected.Delete("/groups/{id}/members/{userId}", groupHandler.RemoveMember)
			protected.Post("/groups/{id}/leave", groupHandler.Leave)
			protected.Post("/groups/{id}/join-requests", groupHandler.RequestJoin)
			protected.Get("/groups/{id}/join-requests", groupHandler.ListJoinRequests)
			protected.Post("/groups/{id}/join-requests/{requestId}/approve", groupHandler.ApproveJoinRequest)
			protected.Post("/groups/{id}/join-requests/{requestId}/reject", groupHandler.RejectJoinRequest)
			protected.Get("/friends", friendHandler.ListFriends)
			protected.Get("/friends/requests", friendHandler.ListPendingRequests)
			protected.Post("/friends/requests", friendHandler.SendRequest)
			protected.Post("/friends/requests/{requestId}/accept", friendHandler.AcceptRequest)
			protected.Post("/friends/requests/{requestId}/reject", friendHandler.RejectRequest)
			protected.Delete("/friends/requests/{requestId}", friendHandler.CancelRequest)
			protected.Delete("/friends/{userId}", friendHandler.RemoveFriend)
			protected.Get("/users/search", friendHandler.SearchUsers)
			protected.Get("/blocks", blockHandler.List)
			protected.Post("/blocks", blockHandler.Block)
			protected.Delete("/blocks/{userId}", blockHandler.Unblock)

			protected.Post("/requests", prayerHandler.Create)
			protected.Get("/requests/{id}", prayerHandler.GetByID)
			protected.Patch("/requests/{id}", prayerHandler.Update)
			protected.Delete("/requests/{id}", prayerHandler.Delete)
			protected.Post("/requests/{id}/pray", prayerHandler.Pray)
			protected.Get("/moderation/queue", moderationHandler.Queue)
			protected.Post("/moderation/{requestId}/approve", moderationHandler.Approve)
			protected.Post("/moderation/{requestId}/reject", moderationHandler.Reject)
			protected.Post("/moderation/{requestId}/request-changes", moderationHandler.RequestChanges)
			protected.Get("/moderation/{requestId}/history", moderationHandler.History)

			protected.Get("/notifications", notificationHandler.List)
			protected.Get("/notifications/unread-count", notificationHandler.UnreadCount)
			protected.Post("/notifications/{id}/read", notificationHandler.MarkRead)
			protected.Post("/notifications/read-all", notificationHandler.MarkAllRead)
		})
	})

	return r
}
