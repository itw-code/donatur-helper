# Use explicit mobile refresh with safe background polling

Dashboards will expose a visible refresh control and retain background polling where it already exists, pausing polling when the page is hidden. Refresh state or last-updated feedback should be visible, and refresh must not interrupt an active form or modal. Pull-to-refresh is deferred because it can conflict with scrolling and editing gestures.
