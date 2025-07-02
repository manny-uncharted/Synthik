# app/auth/utils/roles.py

# Defines the hierarchy of roles and their associated permissions.

ROLE_HIERARCHY = {
    'SUPERADMIN': [
        'ADMIN',
        'REVIEWER',
        'FINANCE',
        'SUPPORT',
        'ANALYTICS',
        'ADVERTISER',
        'SPONSOR',
        'CREATOR',
        'ANNOTATOR',
        'USER',
    ],
    'ADMIN': [
        'REVIEWER',
        'FINANCE',
        'SUPPORT',
        'ANALYTICS',
        'ADVERTISER',
        'SPONSOR',
        'CREATOR',
        'ANNOTATOR',
        'USER',
    ],
    'REVIEWER': [
        'ANNOTATOR',
    ],
    'FINANCE': [],
    'SUPPORT': [],
    'ANALYTICS': [],
    'ADVERTISER': [],
    'SPONSOR': [],
    'CREATOR': [],
    'ANNOTATOR': [],
    'USER': [],
}

ROLE_PERMISSIONS = {
    'SUPERADMIN': ['*'],
    'ADMIN': ['*'],
    'REVIEWER': [
        'annotations:read',
        'annotations:approve',
        'submissions:read',
        'submissions:manage',
    ],
    'FINANCE': [
        'payouts:execute',
        'escrow:manage',
        'transactions:read',
    ],
    'SUPPORT': [
        'users:read',
        'tickets:manage',
        'notifications:send',
    ],
    'ANALYTICS': [
        'reports:read',
        'metrics:view',
        'logs:read',
    ],
    'ADVERTISER': [
        'ads:create',
        'ads:manage',
        'campaigns:read',
        'billing:view',
    ],
    'SPONSOR': [
        'sponsorships:create',
        'sponsorships:manage',
        'billing:view',
    ],
    'CREATOR': [
        'content:create',
        'content:edit',
        'content:delete',
        'content:publish',
    ],
    'ANNOTATOR': [
        'annotations:create',
        'annotations:edit',
        'annotations:delete',
    ],
    'USER': [
        'content:read',
        'profile:read',
        'profile:edit',
    ],
}
