-- Security correction: historical JSON can contain owner diagnostics. All chat
-- history clients use the authenticated server API, which sanitizes responses.
-- Preserve data, RLS, service-role access, and every existing RPC unchanged.
revoke select on table public.emet_conversation_turns from authenticated;
-- Recovery: after reviewing all stored JSON for private diagnostics, the prior
-- grant can be restored with GRANT SELECT ON public.emet_conversation_turns TO authenticated.
-- Application rollback does not require restoring that grant: prior server routes
-- also read history through service_role.
