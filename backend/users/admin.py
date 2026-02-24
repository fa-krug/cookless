from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from users.models import Household, HouseholdMember, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("email", "apple_id", "preferred_language", "is_active", "is_staff")
    list_filter = ("is_active", "is_staff", "preferred_language")
    search_fields = ("email", "apple_id")
    ordering = ("email",)

    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Profile", {"fields": ("apple_id", "preferred_language", "active_household", "settings")}),
        (
            "Permissions",
            {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")},
        ),
    )
    add_fieldsets = (
        (None, {"classes": ("wide",), "fields": ("email", "apple_id", "password1", "password2")}),
    )


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
