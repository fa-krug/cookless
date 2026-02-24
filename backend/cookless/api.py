from ninja import NinjaAPI

from cookless.auth import auth

api = NinjaAPI(
    title="Cook Less",
    version="1.0.0",
    auth=auth,
    urls_namespace="api-v1",
)
