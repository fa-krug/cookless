#!/bin/bash
set -euo pipefail

# Ensure data directory exists (for SQLite + media when DATA_DIR is set)
mkdir -p "${DATA_DIR:-/app/data}"

python manage.py collectstatic --noinput
python manage.py migrate --noinput

if [ -n "$SUPERUSER_EMAIL" ] && [ -n "$SUPERUSER_PASSWORD" ]; then
    echo "Checking for superuser..."
    python manage.py shell << EOF
from django.contrib.auth import get_user_model
User = get_user_model()

if not User.objects.filter(email='$SUPERUSER_EMAIL').exists():
    User.objects.create_superuser(
        email='$SUPERUSER_EMAIL',
        password='$SUPERUSER_PASSWORD',
    )
    print('Superuser created: $SUPERUSER_EMAIL')
else:
    print('Superuser already exists: $SUPERUSER_EMAIL')
EOF
fi

exec "$@"
