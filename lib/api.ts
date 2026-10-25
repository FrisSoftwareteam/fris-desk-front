import {
  CSRF_HEADER,
  type AdminUserCreateDto,
  type AdminUserDto,
  type AdminUserPatchDto,
  type AgeingDto,
  type AgentReportDto,
  type BreakdownDto,
  type BreakdownGroup,
  type BulkResultDto,
  type BulkTicketPatchDto,
  type StatusReasonDto,
  type ReportExport,
  type AssignmentRuleDto,
  type DepartmentDto,
  type EscalateDto,
  type ReportQuery,
  type ReportSummaryDto,
  type SettingsDto,
  type SlaPolicyDto,
  type AttachmentDto,
  type AuthConfigResponse,
  type ComposeKind,
  type CreateEnquiryDto,
  type DraftDto,
  type SaveDraftDto,
  type SendMessageDto,
  type TemplateDto,
  type TemplateInput,
  type NotificationListDto,
  type SendResultDto,
  type SessionDto,
  type ApprovalPolicyDto,
  type ApproveReplyDto,
  type CategoryDto,
  type FolderDto,
  type HealthResponse,
  type HistoryEntryDto,
  type MailboxStatusDto,
  type Role,
  type StaffDto,
  type TicketCountsDto,
  type TicketDetailDto,
  type TicketListResponse,
  type TicketPatchDto,
  type TicketSummaryDto,
  type UserDto,
} from '@/lib/shared';
import { config } from './config';
import { clearToken, getToken, setToken } from './session';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Multipart upload; sent as-is so the browser sets the boundary. */
  formData?: FormData;
  /** Lets the request finish even if the page is closing (draft autosave on unload). */
  keepalive?: boolean;
  headers?: Record<string, string>;
  /** Return the body even for these non-2xx statuses (e.g. /health answers 503 with a body). */
  acceptStatuses?: number[];
}

/** `Authorization: Bearer <session token>` when signed in. */
function authHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** A 401 means the token expired or was refused; forget it so the sign-in screen starts clean. */
function forgetSessionOn401(status: number): void {
  if (status === 401) clearToken();
}

/** Browsers refuse keepalive request bodies over 64 KB (in bytes); stay under it. */
const KEEPALIVE_MAX_BYTES = 60_000;

async function request<T>(
  path: string,
  { method = 'GET', body, formData, keepalive, headers, acceptStatuses = [] }: RequestOptions = {},
): Promise<T> {
  const json = body !== undefined ? JSON.stringify(body) : undefined;
  let res: Response;
  try {
    res = await fetch(`${config.apiBaseUrl}${path}`, {
      method,
      cache: 'no-store',
      headers: {
        ...authHeader(),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(method !== 'GET' ? { [CSRF_HEADER]: '1' } : {}),
        ...headers,
      },
      body: formData ?? json,
      // Browsers refuse keepalive requests over 64 KB; a long draft goes as a normal request.
      keepalive: keepalive && new TextEncoder().encode(json ?? '').length < KEEPALIVE_MAX_BYTES,
    });
  } catch {
    throw new ApiError(0, `Can't reach the server at ${config.apiBaseUrl}. Check that the API is running.`);
  }

  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok && !acceptStatuses.includes(res.status)) {
    forgetSessionOn401(res.status);
    const message = (data as { error?: string } | null)?.error ?? res.statusText;
    throw new ApiError(res.status, message);
  }
  return data as T;
}

/** GETs a file (not JSON) from the API; errors come back as ApiError like any other call. */
async function fetchFile(path: string, cache: RequestCache = 'no-store'): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${config.apiBaseUrl}${path}`, { headers: authHeader(), cache });
  } catch {
    throw new ApiError(0, `Can't reach the server at ${config.apiBaseUrl}. Check that the API is running.`);
  }
  if (!res.ok) {
    forgetSessionOn401(res.status);
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(res.status, data?.error ?? res.statusText);
  }
  return res;
}

/** The file name in a Content-Disposition header (`filename*=UTF-8''…` or `filename="…"`). */
function filenameFrom(header: string | null): string | undefined {
  if (!header) return undefined;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header)?.[1];
  if (encoded) {
    try {
      return decodeURIComponent(encoded);
    } catch {
      // Malformed; try the plain form.
    }
  }
  return /filename="([^"]+)"/.exec(header)?.[1];
}

/** Keeps the session token from a sign-in and returns the officer. */
async function startSession(session: Promise<SessionDto>): Promise<UserDto> {
  const { user, token } = await session;
  setToken(token);
  return user;
}

/** Fetches a file from the API and saves it, named as the API names it (CSV exports, attachments). */
async function download(path: string, fallbackName: string): Promise<void> {
  const res = await fetchFile(path);
  const name = filenameFrom(res.headers.get('Content-Disposition')) ?? fallbackName;
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const api = {
  health: () => request<HealthResponse>('/health', { acceptStatuses: [503] }),

  authConfig: () => request<AuthConfigResponse>('/auth/config'),
  me: () => request<UserDto>('/me'),
  /** Exchanges a Microsoft access token (for this API) for an app session token, kept for later calls. */
  createSession: (msAccessToken: string) =>
    startSession(
      request<SessionDto>('/auth/session', { method: 'POST', headers: { Authorization: `Bearer ${msAccessToken}` } }),
    ),
  devLogin: (body: { email: string; displayName: string; role: Role }) =>
    startSession(request<SessionDto>('/auth/dev-login', { method: 'POST', body })),
  /** Signing out is forgetting the token (the API's sessions are stateless). */
  logout: async () => {
    await request<void>('/auth/logout', { method: 'POST' }).catch(() => undefined);
    clearToken();
  },

  mailbox: () => request<MailboxStatusDto>('/mailbox'),
  folders: () => request<FolderDto[]>('/folders'),
  categories: () => request<CategoryDto[]>('/categories'),
  users: () => request<StaffDto[]>('/users'),
  statusReasons: () => request<StatusReasonDto[]>('/status-reasons'),

  tickets: (params: { view: string; tab: 'open' | 'resolved'; q?: string; cursor?: string | null }) => {
    const qs = new URLSearchParams({ view: params.view, tab: params.tab });
    if (params.q) qs.set('q', params.q);
    if (params.cursor) qs.set('cursor', params.cursor);
    return request<TicketListResponse>(`/tickets?${qs}`);
  },
  ticketCounts: () => request<TicketCountsDto>('/tickets/counts'),
  ticket: (id: string) => request<TicketDetailDto>(`/tickets/${encodeURIComponent(id)}`),
  patchTicket: (id: string, patch: TicketPatchDto) =>
    request<TicketSummaryDto>(`/tickets/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch }),

  /** One change applied to several enquiries; refusals come back in `failed`. */
  bulkUpdate: (body: BulkTicketPatchDto) => request<BulkResultDto>('/tickets/bulk', { method: 'POST', body }),
  bulkDelete: (ids: string[]) => request<BulkResultDto>('/tickets/bulk/delete', { method: 'POST', body: { ids } }),
  bulkRestore: (ids: string[]) => request<BulkResultDto>('/tickets/bulk/restore', { method: 'POST', body: { ids } }),

  /** Saves an attachment (pictures included), named as the API names it. */
  downloadAttachment: (id: string, fallbackName = 'attachment') =>
    download(`/attachments/${encodeURIComponent(id)}?download=1`, fallbackName),
  /** An attachment's bytes, for the in-app previewer (the API caches them privately for an hour). */
  attachmentBlob: async (id: string) => (await fetchFile(`/attachments/${encodeURIComponent(id)}`, 'default')).blob(),

  sendMessage: (ticketId: string, message: SendMessageDto) =>
    request<SendResultDto>(`/tickets/${encodeURIComponent(ticketId)}/messages`, { method: 'POST', body: message }),
  // Supervisor approval of replies.
  approvalPolicy: () => request<ApprovalPolicyDto>('/settings/approval'),
  patchApprovalPolicy: (body: Partial<ApprovalPolicyDto>) =>
    request<ApprovalPolicyDto>('/settings/approval', { method: 'PATCH', body }),
  approveReply: (id: string, edits: ApproveReplyDto = {}) =>
    request<TicketDetailDto>(`/pending-replies/${encodeURIComponent(id)}/approve`, { method: 'POST', body: edits }),
  returnReply: (id: string, comment: string) =>
    request<TicketDetailDto>(`/pending-replies/${encodeURIComponent(id)}/return`, {
      method: 'POST',
      body: { comment },
    }),
  uploadAttachments: (ticketId: string, files: File[]) => {
    const formData = new FormData();
    for (const f of files) formData.append('files', f);
    return request<AttachmentDto[]>(`/tickets/${encodeURIComponent(ticketId)}/attachments`, {
      method: 'POST',
      formData,
    });
  },
  /** Stages copies of a template's form files on this enquiry, for the reply being written. */
  copyTemplateFiles: (ticketId: string, templateId: string) =>
    request<AttachmentDto[]>(
      `/tickets/${encodeURIComponent(ticketId)}/attachments/from-template/${encodeURIComponent(templateId)}`,
      { method: 'POST' },
    ),
  draft: (ticketId: string) => request<DraftDto | null>(`/tickets/${encodeURIComponent(ticketId)}/draft`),
  saveDraft: (ticketId: string, draft: SaveDraftDto, opts: { keepalive?: boolean } = {}) =>
    request<DraftDto>(`/tickets/${encodeURIComponent(ticketId)}/draft`, { method: 'PUT', body: draft, ...opts }),
  discardDraft: (ticketId: string, kind: ComposeKind) =>
    request<void>(`/tickets/${encodeURIComponent(ticketId)}/draft?kind=${kind}`, { method: 'DELETE' }),
  /** Supervisors and admins: move to Deleted items / restore. Admins: remove for good. */
  deleteTicket: (id: string) => request<void>(`/tickets/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  restoreTicket: (id: string) =>
    request<TicketSummaryDto>(`/tickets/${encodeURIComponent(id)}/restore`, { method: 'POST' }),
  purgeTicket: (id: string) => request<void>(`/tickets/${encodeURIComponent(id)}/permanent`, { method: 'DELETE' }),
  history: (ticketId: string) => request<HistoryEntryDto[]>(`/tickets/${encodeURIComponent(ticketId)}/history`),
  createEnquiry: (enquiry: CreateEnquiryDto) =>
    request<TicketSummaryDto>('/tickets', { method: 'POST', body: enquiry }),
  // The bell (in-app notifications for the signed-in officer).
  notifications: () => request<NotificationListDto>('/notifications'),
  readNotifications: (which: { ids: string[] } | { ticketId: string } | { all: true }) =>
    request<{ updated: number }>('/notifications/read', { method: 'POST', body: which }),
  templates: (folderId: string | null) =>
    request<TemplateDto[]>(`/templates${folderId ? `?folderId=${encodeURIComponent(folderId)}` : ''}`),

  // Escalation directory and the Escalate action.
  departments: (opts: { all?: boolean } = {}) => request<DepartmentDto[]>(`/departments${opts.all ? '?all=true' : ''}`),
  escalate: (ticketId: string, body: EscalateDto) =>
    request<TicketDetailDto>(`/tickets/${encodeURIComponent(ticketId)}/escalate`, { method: 'POST', body }),

  // Reports (Agent Activity Dashboard).
  reportSummary: (q: ReportQuery) => request<ReportSummaryDto>(`/reports/summary?${reportQs(q)}`),
  reportAgents: (q: ReportQuery) => request<AgentReportDto>(`/reports/agents?${reportQs(q)}`),
  reportAgeing: (q: ReportQuery) => request<AgeingDto>(`/reports/ageing?${reportQs(q)}`),
  reportBreakdown: (q: ReportQuery, groupBy: BreakdownGroup) =>
    request<BreakdownDto>(`/reports/breakdown?${reportQs(q)}&groupBy=${groupBy}`),
  exportReport: (kind: ReportExport, q: ReportQuery) =>
    download(`/reports/export.csv?${reportQs(q)}&kind=${kind}`, `registrar-desk-${kind}.csv`),
  /** Supervisors and admins: everything in the current message-list view, as CSV. */
  exportTickets: (params: { view: string; tab: 'open' | 'resolved'; q?: string }) => {
    const qs = new URLSearchParams({ view: params.view, tab: params.tab });
    if (params.q) qs.set('q', params.q);
    return download(`/tickets/export.csv?${qs}`, 'registrar-desk-enquiries.csv');
  },

  // Admin screens.
  admin: {
    users: () => request<AdminUserDto[]>('/admin/users'),
    patchUser: (id: string, patch: AdminUserPatchDto) =>
      request<AdminUserDto>(`/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch }),
    /** Adds someone before their first sign-in, with their role already set. */
    createUser: (body: AdminUserCreateDto) => request<AdminUserDto>('/admin/users', { method: 'POST', body }),
    /** Only for people who haven't signed in yet. */
    removeUser: (id: string) => request<void>(`/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    settings: () => request<SettingsDto>('/settings'),
    patchSettings: (patch: Partial<SettingsDto>) => request<SettingsDto>('/settings', { method: 'PATCH', body: patch }),
    folders: crud<FolderDto, Pick<FolderDto, 'name' | 'order' | 'parentId'>>('/folders', 'PATCH'),
    categories: crud<CategoryDto, Omit<CategoryDto, 'id'>>('/categories', 'PATCH'),
    templates: crud<TemplateDto, TemplateInput>('/templates', 'PATCH'),
    uploadTemplateFiles: (files: File[]) => {
      const formData = new FormData();
      for (const f of files) formData.append('files', f);
      return request<AttachmentDto[]>('/templates/files', { method: 'POST', formData });
    },
    rulesList: () => request<AssignmentRuleDto[]>('/assignment-rules'),
    slaList: () => request<SlaPolicyDto[]>('/sla-policies'),
    rules: crud<AssignmentRuleDto, Omit<AssignmentRuleDto, 'id'>>('/assignment-rules', 'PUT'),
    slaPolicies: crud<SlaPolicyDto, Omit<SlaPolicyDto, 'id'>>('/sla-policies', 'PUT'),
    departments: crud<DepartmentDto, Omit<DepartmentDto, 'id'>>('/departments', 'PATCH'),
    /** The parent status is fixed once created, so updates leave `baseStatus` out. */
    statusReasons: crud<StatusReasonDto, Partial<Omit<StatusReasonDto, 'id'>>>('/status-reasons', 'PATCH'),
  },
};

function reportQs(q: ReportQuery): string {
  return new URLSearchParams(Object.entries(q).filter(([, v]) => v) as [string, string][]).toString();
}

/** Create / update / delete for one admin collection. `updateMethod` is PUT where the API replaces whole records. */
function crud<T extends { id: string }, Body>(path: string, updateMethod: 'PATCH' | 'PUT') {
  const one = (id: string) => `${path}/${encodeURIComponent(id)}`;
  return {
    create: (body: Body) => request<T>(path, { method: 'POST', body }),
    update: (id: string, body: Body) => request<T>(one(id), { method: updateMethod, body }),
    remove: (id: string) => request<void>(one(id), { method: 'DELETE' }),
  };
}
