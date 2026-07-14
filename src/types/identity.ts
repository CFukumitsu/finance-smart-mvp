export type UserRole = "admin" | "manager" | "user";
export type UserStatus = "invited" | "active" | "disabled" | "deleted";
export type ProfileTheme = "dark" | "system";

export type UserProfile = {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  avatar_storage_path: string | null;
  role: UserRole;
  status: UserStatus;
  locale: string;
  timezone: string;
  theme: ProfileTheme;
  invited_at: string | null;
  disabled_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminUserListItem = {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  invitedAt: string | null;
  lastSignInAt: string | null;
  provider: string;
};
