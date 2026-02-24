from ninja import NinjaAPI

from cookless.auth import auth

api = NinjaAPI(
    title="Cook Less",
    version="1.0.0",
    auth=auth,
    urls_namespace="api-v1",
)

from planner.api import router as planner_router  # noqa: E402
from recipes.api import router as recipes_router  # noqa: E402
from shopping.api import router as shopping_router  # noqa: E402
from users.api import router as users_router  # noqa: E402

api.add_router("", users_router)
api.add_router("", recipes_router)
api.add_router("", planner_router)
api.add_router("", shopping_router)
