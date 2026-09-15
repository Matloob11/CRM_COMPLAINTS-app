import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryResult,
} from '@tanstack/react-query'
import { api, type ListParams } from './client'
import type {
  Complaint,
  ComplaintSummary,
  CreateComplaintPayload,
  Me,
  Message,
  Paginated,
  PatchComplaintPayload,
  StatsResponse,
} from './types'

export const qk = {
  me: ['me'] as const,
  stats: ['stats'] as const,
  complaints: (params: ListParams) => ['complaints', params] as const,
  complaintsRoot: ['complaints'] as const,
  complaint: (id: number) => ['complaint', id] as const,
  messages: (id: number) => ['messages', id] as const,
  admins: ['admins'] as const,
}

export function useMe(): UseQueryResult<Me> {
  return useQuery({
    queryKey: qk.me,
    queryFn: api.me,
    staleTime: 5 * 60_000,
    retry: (count, error) => !isTerminal(error) && count < 2,
  })
}

export function useStats(pollMs: number | false): UseQueryResult<StatsResponse> {
  return useQuery({
    queryKey: qk.stats,
    queryFn: api.stats,
    refetchInterval: pollMs,
  })
}

export function useComplaints(
  params: ListParams,
  pollMs: number | false,
): UseQueryResult<Paginated<ComplaintSummary>> {
  return useQuery({
    queryKey: qk.complaints(params),
    queryFn: () => api.listComplaints(params),
    placeholderData: (prev) => prev,
    refetchInterval: pollMs,
  })
}

export function useComplaint(id: number | null): UseQueryResult<Complaint> {
  return useQuery({
    queryKey: qk.complaint(id ?? -1),
    queryFn: () => api.getComplaint(id as number),
    enabled: id != null,
  })
}

export function useMessages(
  id: number | null,
  pollMs: number | false,
): UseQueryResult<Paginated<Message>> {
  return useQuery({
    queryKey: qk.messages(id ?? -1),
    queryFn: () => api.listMessages(id as number),
    enabled: id != null,
    refetchInterval: pollMs,
  })
}

export function useAdmins(enabled: boolean) {
  return useQuery({
    queryKey: qk.admins,
    queryFn: api.listAdmins,
    enabled,
    staleTime: 10 * 60_000,
  })
}

function isTerminal(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { status?: number }).status === 401
}

export function useCreateComplaint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: CreateComplaintPayload) => api.createComplaint(payload),
    onSuccess: (complaint) => {
      qc.setQueryData(qk.complaint(complaint.id), complaint)
      void qc.invalidateQueries({ queryKey: qk.complaintsRoot })
      void qc.invalidateQueries({ queryKey: qk.stats })
    },
  })
}

export function usePatchComplaint(id: number) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: PatchComplaintPayload) => api.patchComplaint(id, payload),
    onSuccess: (complaint) => {
      qc.setQueryData(qk.complaint(id), complaint)
      patchSummaryEverywhere(qc, complaint)
      void qc.invalidateQueries({ queryKey: qk.messages(id) })
      void qc.invalidateQueries({ queryKey: qk.stats })
    },
  })
}

/**
 * Surgical cache update: rewrite the row inside every cached list page rather
 * than invalidating the whole list tree, which would refetch the world on every
 * realtime event.
 */
export function patchSummaryEverywhere(qc: QueryClient, next: ComplaintSummary): void {
  qc.setQueriesData<Paginated<ComplaintSummary>>({ queryKey: qk.complaintsRoot }, (old) => {
    if (!old) return old
    const idx = old.results.findIndex((c) => c.id === next.id)
    if (idx === -1) return old
    const results = old.results.slice()
    results[idx] = { ...results[idx], ...next } as ComplaintSummary
    results.sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))
    return { ...old, results }
  })
}

export function upsertMessage(qc: QueryClient, complaintId: number, message: Message): void {
  qc.setQueryData<Paginated<Message>>(qk.messages(complaintId), (old) => {
    if (!old) return old
    if (old.results.some((m) => m.id === message.id)) return old
    return { ...old, results: [...old.results, message], count: old.count + 1 }
  })
}
