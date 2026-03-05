import client from "./client";

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  is_admin: boolean;
  owned_kb_count: number;
  created_at?: string | null;
}

export interface AdminKnowledgeBase {
  id: number;
  name: string;
  description: string;
  visibility: "public" | "private";
  owner_id: number;
  owner_username: string;
  document_count: number;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AdminUserKnowledgeBase extends AdminKnowledgeBase {
  user_role: "owner" | "admin" | "write" | "read";
}

export const adminApi = {
  listUsers: () => client.get<AdminUser[]>("/admin/users"),
  listKnowledgeBases: () => client.get<AdminKnowledgeBase[]>("/admin/knowledge-bases"),
  listUserKnowledgeBases: (userId: number) =>
    client.get<AdminUserKnowledgeBase[]>(`/admin/users/${userId}/knowledge-bases`),
};
