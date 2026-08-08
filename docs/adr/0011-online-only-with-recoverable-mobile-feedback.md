# Keep the app online-only with recoverable mobile feedback

The mobile-first redesign will not add offline or PWA behavior in this scope. Slow or failed requests must still provide labeled loading feedback, disable duplicate submissions, preserve entered form data, and expose a clear retry path; payment, approval, verification, and destructive actions will not use optimistic success states.
