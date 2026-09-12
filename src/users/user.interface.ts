export const USER_ROLE = {
  Admin: 1,
  Staff: 2,
} as const;

export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

export const USER_ROLE_LABEL: Record<UserRole, string> = {
  [USER_ROLE.Admin]: 'Admin',
  [USER_ROLE.Staff]: 'Staff',
};

// New signups sit as Pending until an Admin approves (or rejects) them —
// login is blocked for anything other than Approved.
export const USER_STATUS = {
  Pending: 1,
  Approved: 2,
  Rejected: 3,
} as const;

export type UserStatus = (typeof USER_STATUS)[keyof typeof USER_STATUS];

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  [USER_STATUS.Pending]: 'Pending Approval',
  [USER_STATUS.Approved]: 'Approved',
  [USER_STATUS.Rejected]: 'Rejected',
};

export interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  is_active: boolean;
}

export type PublicUser = Omit<UserRow, 'password_hash'>;
