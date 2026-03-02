import client from "./client";

export type Visibility = "public" | "private";
export type MemberRole = "owner" | "admin" | "write" | "read";

export interface KnowledgeBase {
  id: number;
  name: string;
  description: string;
  visibility: Visibility;
  owner_id: number;
  owner_username?: string;
  created_at?: string;
  updated_at?: string;
  document_count: number;
}

export interface Member {
  id: number;
  user_id: number;
  username: string;
  email: string;
  role: MemberRole;
  created_at?: string;
}

export interface Document {
  id: number;
  filename: string;
  content_type: string;
  file_size: number;
  chunk_count: number;
  created_at?: string;
}

export const kbApi = {
  list: () => client.get<KnowledgeBase[]>("/knowledge-bases"),
  create: (data: { name: string; description?: string; visibility?: Visibility }) =>
    client.post<KnowledgeBase>("/knowledge-bases", data),
  get: (id: number) => client.get<KnowledgeBase>(`/knowledge-bases/${id}`),
  update: (id: number, data: { name?: string; description?: string; visibility?: Visibility }) =>
    client.patch<KnowledgeBase>(`/knowledge-bases/${id}`, data),
  delete: (id: number) => client.delete(`/knowledge-bases/${id}`),
  listDocuments: (id: number) => client.get<Document[]>(`/knowledge-bases/${id}/documents`),
  uploadDocument: (id: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return client.post<{ document_id: number; chunk_count: number }>(
      `/knowledge-bases/${id}/documents`,
      form,
      { headers: { "Content-Type": "multipart/form-data" } }
    );
  },
  listMembers: (id: number) => client.get<Member[]>(`/knowledge-bases/${id}/members`),
  addMember: (id: number, data: { user_id: number; role: MemberRole }) =>
    client.post<Member>(`/knowledge-bases/${id}/members`, data),
  updateMember: (id: number, userId: number, role: MemberRole) =>
    client.patch<Member>(`/knowledge-bases/${id}/members/${userId}`, { role }),
  removeMember: (id: number, userId: number) =>
    client.delete(`/knowledge-bases/${id}/members/${userId}`),
};
