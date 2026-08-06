import secrets

from demoloop_core.db import admin_engine
from demoloop_core.models import Environment, Job, Membership, Product, Workspace
from demoloop_core.settings import settings
from fastapi import FastAPI
from sqladmin import Admin, ModelView
from sqladmin.authentication import AuthenticationBackend
from starlette.requests import Request
from starlette.responses import RedirectResponse


class OperatorAuth(AuthenticationBackend):
    async def login(self, request: Request) -> bool:
        form = await request.form()
        # Constant-time compare so a wrong token cannot be found by timing the response.
        if secrets.compare_digest(str(form.get("password", "")), settings().admin_token):
            request.session.update({"operator": True})
            return True
        return False

    async def logout(self, request: Request) -> bool:
        request.session.clear()
        return True

    async def authenticate(self, request: Request) -> bool | RedirectResponse:
        if request.session.get("operator"):
            return True
        return RedirectResponse(request.url_for("admin:login"), status_code=302)


class WorkspaceAdmin(ModelView, model=Workspace):
    column_list = [Workspace.id, Workspace.name]
    can_delete = False


class MembershipAdmin(ModelView, model=Membership):
    column_list = [Membership.workspace_id, Membership.user_id, Membership.role]
    can_delete = False


class ProductAdmin(ModelView, model=Product):
    column_list = [Product.id, Product.workspace_id, Product.name]
    can_delete = False


class EnvironmentAdmin(ModelView, model=Environment):
    column_list = [Environment.id, Environment.workspace_id, Environment.name, Environment.url]
    can_delete = False


class JobAdmin(ModelView, model=Job):
    column_list = [Job.id, Job.workspace_id, Job.kind, Job.status, Job.attempt]
    can_edit = False
    can_create = False
    can_delete = False


def mount_admin(app: FastAPI) -> None:
    """The console is absent unless an operator token is configured, so a default deployment has no door."""
    if not settings().admin_token:
        return
    admin = Admin(
        app, admin_engine(),
        authentication_backend=OperatorAuth(secret_key=settings().admin_token),
        title="Demoloop operations",
    )
    for view in (WorkspaceAdmin, MembershipAdmin, ProductAdmin, EnvironmentAdmin, JobAdmin):
        admin.add_view(view)
