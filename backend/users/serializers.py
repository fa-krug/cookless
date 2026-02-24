from rest_framework import serializers

from users.models import Household, HouseholdMember, Invite


class HouseholdMemberSerializer(serializers.ModelSerializer):
    user = serializers.EmailField(source="user.email", read_only=True)

    class Meta:
        model = HouseholdMember
        fields = ["id", "user", "role", "joined_at"]
        read_only_fields = fields


class HouseholdSerializer(serializers.ModelSerializer):
    members = HouseholdMemberSerializer(many=True, read_only=True)

    class Meta:
        model = Household
        fields = ["id", "name", "members"]
        read_only_fields = ["id", "members"]


class HouseholdSummarySerializer(serializers.ModelSerializer):
    """Lightweight household representation for nesting inside UserSerializer."""

    class Meta:
        model = Household
        fields = ["id", "name"]
        read_only_fields = fields


class UserSerializer(serializers.Serializer):
    """Custom serializer for User that supports nested read / UUID write for active_household."""

    id = serializers.UUIDField(read_only=True)
    email = serializers.EmailField(read_only=True)
    preferred_language = serializers.ChoiceField(
        choices=[("en", "English"), ("de", "Deutsch")],
        required=False,
    )
    settings = serializers.JSONField(required=False)
    active_household = serializers.UUIDField(required=False, allow_null=True)

    def validate_active_household(self, value):
        if value is not None:
            from users.models import HouseholdMember

            if not Household.objects.filter(pk=value).exists():
                raise serializers.ValidationError("Household not found.")
            if not HouseholdMember.objects.filter(household_id=value, user=self.instance).exists():
                raise serializers.ValidationError("You are not a member of this household.")
        return value

    def to_representation(self, instance):
        data = {
            "id": str(instance.id),
            "email": instance.email,
            "preferred_language": instance.preferred_language,
            "settings": instance.settings,
        }
        if instance.active_household:
            data["active_household"] = HouseholdSummarySerializer(instance.active_household).data
        else:
            data["active_household"] = None
        return data

    def update(self, instance, validated_data):
        if "preferred_language" in validated_data:
            instance.preferred_language = validated_data["preferred_language"]
        if "settings" in validated_data:
            instance.settings = validated_data["settings"]
        if "active_household" in validated_data:
            ah_uuid = validated_data["active_household"]
            if ah_uuid is None:
                instance.active_household = None
            else:
                instance.active_household = Household.objects.get(pk=ah_uuid)
        instance.save()
        return instance


class InviteSerializer(serializers.ModelSerializer):
    class Meta:
        model = Invite
        fields = ["code", "expires_at", "household"]
        read_only_fields = fields
