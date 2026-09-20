# API request limits

The Harbor project API allows 60 requests per minute per workspace. A 429 response means the request limit was exceeded. Respect the Retry-After header and retry with exponential backoff. Do not retry validation errors without correcting the request. API tokens inherit the permissions of the user who created them.
