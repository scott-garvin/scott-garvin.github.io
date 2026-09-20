"""Apply the same transport limits to native and single-container APIs."""

from starlette.responses import JSONResponse


class RequestBodyLimit:
    def __init__(self, app, maximum=16384):
        self.app = app
        self.maximum = maximum

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "POST":
            return await self.app(scope, receive, send)
        body = bytearray()
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            body.extend(message.get("body", b""))
            if len(body) > self.maximum:
                response = JSONResponse(
                    {"detail": "Request too large"}, status_code=413
                )
                return await response(scope, receive, send)
            if not message.get("more_body", False):
                break

        async def replay():
            nonlocal body
            if body is not None:
                result = bytes(body)
                body = None
                return {"type": "http.request", "body": result, "more_body": False}
            return await receive()

        await self.app(scope, replay, send)
