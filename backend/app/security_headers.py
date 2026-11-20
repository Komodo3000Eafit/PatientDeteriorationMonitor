"""HTTP security headers middleware (TS-10).

Sets a small set of OWASP response headers on every response, including error
responses (422/401/429/503). Contract: specs/010-backend-deployment/contracts/security-controls.md
section 3 (FR-010, AC9). No new dependency: a plain Starlette/ASGI middleware.
"""

from starlette.types import ASGIApp, Message, Receive, Scope, Send

# TS-11: revisit the CSP when the React build is served from this origin. The
# policy allows same-origin ('self') assets so TS-11's bundle is not blocked,
# while forbidding framing and inline <base>/<object> abuse.
SECURITY_HEADERS: list[tuple[bytes, bytes]] = [
    (
        b"content-security-policy",
        b"default-src 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    ),
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
]


class SecurityHeadersMiddleware:
    """Add the security headers to every HTTP response (errors included)."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = message.setdefault("headers", [])
                present = {name.lower() for name, _ in headers}
                for name, value in SECURITY_HEADERS:
                    if name not in present:
                        headers.append((name, value))
            await send(message)

        await self.app(scope, receive, send_with_headers)
