import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import clsx from 'clsx'
import { SESSION_EXPIRED_EVENT } from '@/api/client'
import { useAdmins, useComplaints, useMe, useStats } from '@/api/queries'
import type { ApiUser, ComplaintFilters } from '@/api/types'
import { getToken } from '@/lib/auth'
import { fitWindow } from '@/lib/bx24'
import { TWO_PANE_MIN_WIDTH, useContainerWidth } from '@/hooks/useContainerWidth'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { useRealtime } from '@/hooks/useRealtime'
import { Backdrop } from '@/components/Backdrop'
import { Rail, type View } from '@/components/Rail'
import { Button, EmptyState, ErrorState } from '@/components/primitives'
import { IconInbox, IconLock, IconPlus } from '@/components/Icons'
import { FilterBar } from '@/features/list/FilterBar'
import { FiltersPanel } from '@/features/list/FiltersPanel'
import { ComplaintList } from '@/features/list/ComplaintList'
import { Dashboard } from '@/features/dashboard/Dashboard'
import { Thread } from '@/features/thread/Thread'
import { NewComplaintModal } from '@/features/compose/NewComplaintModal'

const DEFAULT_FILTERS: ComplaintFilters = {
  status: 'all',
  q: '',
  assigned_to: 'all',
  author: 'all',
}

export default function App() {
  const rootRef = useRef<HTMLDivElement>(null)
  const width = useContainerWidth(rootRef)
  // Every breakpoint in this app is measured on our own root, because the CRM
  // sidebar changes the space we get without any window resize happening.
  const twoPane = width === 0 || width >= TWO_PANE_MIN_WIDTH
  const listWidth = width >= 1180 ? 380 : 330

  const [expired, setExpired] = useState(() => getToken() === null)
  const [view, setView] = useState<View>('dashboard')
  const [filters, setFilters] = useState<ComplaintFilters>(DEFAULT_FILTERS)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const debouncedQuery = useDebouncedValue(filters.q, 240)

  useEffect(() => {
    const onExpired = () => setExpired(true)
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired)
  }, [])

  const me = useMe()
  const realtime = useRealtime(!expired && me.isSuccess)
  const stats = useStats(realtime.pollMs)
  const isAdmin = me.data?.role === 'admin'
  const admins = useAdmins(Boolean(isAdmin))

  const listParams = useMemo(
    () => ({
      status: filters.status,
      q: debouncedQuery,
      assigned_to: filters.assigned_to,
      author: filters.author,
    }),
    [filters.status, filters.assigned_to, filters.author, debouncedQuery],
  )

  const complaints = useComplaints(listParams, realtime.pollMs)
  const rows = complaints.data?.results ?? []
  const unread = useMemo(() => rows.reduce((sum, row) => sum + (row.unread_count || 0), 0), [rows])

  // In two panes, keep a selection alive so the thread side is never blank.
  useEffect(() => {
    if (view !== 'complaints' || !twoPane || selectedId !== null || rows.length === 0) return
    setSelectedId(rows[0]?.id ?? null)
  }, [view, twoPane, selectedId, rows])

  // The CRM host has to be told our height changed, or the iframe clips.
  useEffect(() => {
    fitWindow()
  }, [view, twoPane, selectedId, rows.length, composerOpen, expired])

  useEffect(() => {
    const onResize = () => fitWindow()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const authors = useMemo(() => {
    const seen = new Map<number, ApiUser>()
    rows.forEach((row) => seen.set(row.author.bitrix_id, row.author))
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [rows])

  const updateFilters = useCallback((patch: Partial<ComplaintFilters>) => {
    setFilters((current) => ({ ...current, ...patch }))
  }, [])

  const openComplaints = useCallback((id: number) => {
    setView('complaints')
    setSelectedId(id)
  }, [])

  const pickStatus = useCallback((status: ComplaintFilters['status']) => {
    setFilters((current) => ({ ...current, status }))
    setView('complaints')
    setSelectedId(null)
  }, [])

  const filtered =
    filters.status !== 'all' ||
    filters.q.trim() !== '' ||
    filters.assigned_to !== 'all' ||
    filters.author !== 'all'

  const narrowed = filters.assigned_to !== 'all' || filters.author !== 'all'

  // 401 is terminal inside the iframe: there is no refresh flow, so the only
  // honest instruction is to reopen the placement. Any other failure is a
  // transient service problem and gets a retry, not a scary sign-out screen.
  const meStatus = (me.error as { status?: number } | null)?.status
  if (expired || meStatus === 401) {
    return <SessionExpired />
  }

  if (me.isError) {
    return (
      <>
        <Backdrop />
        <div ref={rootRef} className="flex h-full items-center justify-center p-3">
          <div className="glass rounded-pane">
            <ErrorState
              title="Could not reach the complaints service"
              body="The application could not confirm who you are. This is usually a temporary network problem inside the CRM."
              onRetry={() => void me.refetch()}
            />
          </div>
        </div>
      </>
    )
  }

  const listVisible = view === 'complaints' && (twoPane || selectedId === null)
  const threadVisible = view === 'complaints' && selectedId !== null && me.data

  return (
    <>
      <Backdrop />

      <div ref={rootRef} className="flex h-full min-h-0 w-full gap-2 p-2 text-ink-800">
        <a
          href="#complaint-list"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-brand-400 focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-[#04201c]"
        >
          Skip to the complaint list
        </a>

        <Rail
          view={view}
          onView={(next) => {
            setView(next)
            if (next === 'complaints' && !twoPane) setSelectedId(null)
          }}
          onOpenFilters={() => {
            setView('complaints')
            setFiltersOpen(true)
          }}
          filtersActive={narrowed}
          isAdmin={Boolean(isAdmin)}
          realtime={realtime.state}
          unread={unread}
        />

        {view === 'dashboard' ? (
          <main className="glass relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-pane animate-fade-in">
            <Dashboard
              stats={stats.data}
              loading={stats.isLoading || me.isLoading}
              recent={rows}
              isAdmin={Boolean(isAdmin)}
              userName={me.data?.user.name ?? ''}
              onPick={pickStatus}
              onOpen={openComplaints}
              onNew={() => setComposerOpen(true)}
              wide={width >= 900}
            />
          </main>
        ) : (
          <>
            {listVisible ? (
              <section
                id="complaint-list"
                aria-label="Complaints"
                className={clsx(
                  'glass relative flex min-h-0 flex-col overflow-hidden rounded-pane',
                  twoPane ? 'shrink-0' : 'flex-1',
                )}
                style={twoPane ? { width: listWidth } : undefined}
              >
                <FilterBar
                  filters={filters}
                  counts={stats.data?.by_status}
                  onChange={updateFilters}
                  isAdmin={Boolean(isAdmin)}
                />

                <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                  <ComplaintList
                    rows={rows}
                    loading={complaints.isLoading || me.isLoading}
                    error={complaints.error}
                    onRetry={() => void complaints.refetch()}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    isAdmin={Boolean(isAdmin)}
                    filtered={filtered}
                    onClearFilters={() => setFilters(DEFAULT_FILTERS)}
                    onNew={() => setComposerOpen(true)}
                  />
                </div>

                <footer className="p-2.5 pt-1.5">
                  <Button variant="primary" onClick={() => setComposerOpen(true)} className="w-full">
                    <IconPlus size={16} />
                    New complaint
                  </Button>
                </footer>

                <FiltersPanel
                  open={filtersOpen}
                  filters={filters}
                  authors={authors}
                  admins={admins.data?.results ?? []}
                  onChange={updateFilters}
                  onClear={() => updateFilters({ assigned_to: 'all', author: 'all' })}
                  onClose={() => setFiltersOpen(false)}
                />
              </section>
            ) : null}

            {threadVisible && me.data ? (
              <section
                aria-label="Conversation"
                className="glass flex min-h-0 flex-1 flex-col overflow-hidden rounded-pane animate-pane-in"
              >
                <Thread
                  key={selectedId}
                  complaintId={selectedId as number}
                  me={me.data}
                  admins={admins.data?.results ?? []}
                  pollMs={realtime.pollMs}
                  onBack={twoPane ? null : () => setSelectedId(null)}
                />
              </section>
            ) : twoPane ? (
              <section className="glass flex min-h-0 flex-1 items-center justify-center rounded-pane">
                {/* When the list itself is empty its own empty state already
                    carries the call to action, so this pane stays quiet rather
                    than repeating the same button twice on one screen. */}
                <EmptyState
                  icon={<IconInbox size={24} />}
                  title={rows.length === 0 ? 'Nothing here yet' : 'Nothing selected'}
                  body={
                    rows.length === 0
                      ? 'Complaints you raise will open here as a conversation.'
                      : 'Pick a complaint on the left to read the conversation.'
                  }
                />
              </section>
            ) : null}
          </>
        )}
      </div>

      <NewComplaintModal
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onCreated={(id) => {
          setComposerOpen(false)
          openComplaints(id)
        }}
      />
    </>
  )
}

/**
 * There is no refresh flow inside the iframe: the token is minted by the Bitrix
 * handler when the placement opens. So a 401 is terminal, and the only honest
 * instruction is to reopen the app from the CRM sidebar.
 */
function SessionExpired() {
  return (
    <>
      <Backdrop />
      <div className="flex h-full min-h-[360px] items-center justify-center p-6">
        <div className="glass-raised max-w-md rounded-pane px-8 py-10 text-center">
          <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.07] text-ink-400">
            <IconLock size={24} />
          </span>
          <h1 className="font-display text-xl font-semibold tracking-tight text-ink-900">
            Session expired
          </h1>
          <p className="mt-2 text-base leading-relaxed text-ink-500">
            Your secure session has ended. Open{' '}
            <strong className="font-medium text-ink-800">Complaints</strong> again from the CRM
            sidebar to continue — nothing you sent has been lost.
          </p>
        </div>
      </div>
    </>
  )
}
