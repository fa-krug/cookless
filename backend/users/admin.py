from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from users.models import Household, HouseholdMember, Invite, PasskeyCredential, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("email", "preferred_language", "is_active", "is_staff")
    list_filter = ("is_active", "is_staff", "preferred_language")
    search_fields = ("email",)
    ordering = ("email",)

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Profile", {"fields": ("preferred_language", "active_household", "settings")}),
        (
            "Permissions",
            {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")},
        ),
    )
    add_fieldsets = ((None, {"classes": ("wide",), "fields": ("email", "password1", "password2")}),)


class HouseholdMemberInline(admin.TabularInline):
    model = HouseholdMember
    extra = 1


@admin.register(Household)
class HouseholdAdmin(admin.ModelAdmin):
    list_display = ("name", "created_at")
    search_fields = ("name",)
    inlines = [HouseholdMemberInline]


@admin.register(HouseholdMember)
class HouseholdMemberAdmin(admin.ModelAdmin):
    list_display = ("household", "user", "role", "joined_at")
    list_filter = ("role",)


@admin.register(PasskeyCredential)
class PasskeyCredentialAdmin(admin.ModelAdmin):
    list_display = ("user", "device_name", "created_at")
    list_filter = ("user",)
    readonly_fields = ("credential_id", "public_key", "sign_count")


@admin.register(Invite)
class InviteAdmin(admin.ModelAdmin):
    list_display = ("code", "household", "created_by", "expires_at", "used_by")
    list_filter = ("household",)
    search_fields = ("code",)
    readonly_fields = ("code",)
