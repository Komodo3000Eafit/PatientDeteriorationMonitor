"""HTTP security headers middleware (TS-10).

Sets a small set of OWASP response headers on every response, including error
responses (422/401/429/503). Contract: specs/010-backend-deployment/contracts/security-controls.md
section 3 (FR-010, AC9). No new dependency: a plain Starlette/ASGI middleware.
"""

from starlette.types import ASGIApp, Message, Receive, Scope, Send

# TS-11: reviewed (T009) against the served React (Vite) build. The CSP is kept
# unchanged. Vite's default production build emits external, hashed .js/.css
# under assets/, referenced from index.html; both index.html and those assets
# are served from this same origin (see static_serving.py), so they load under
# default-src 'self'. Vite does not emit inline scripts in the default build, so
# no 'unsafe-inline' is added. frame-ancestors 'none', base-uri 'self' and
# object-src 'none' are preserved (FR-011, AC8). AC8/SC-006 are confirmed at the
# e2e check and in the browser.
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
