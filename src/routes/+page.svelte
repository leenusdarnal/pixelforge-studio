<script lang="ts">
  import { onMount } from 'svelte';
  import EditorWorkbench from '$lib/editor/EditorWorkbench.svelte';
  import { clearRecoveryData, getRecoveryOverview, persistProject, type RecoveryOverview } from '$lib/editor/storage';
  import { isProjectSnapshot, type ProjectSnapshot, type RecoveryRecord } from '$lib/editor/project';
  let saveStatus = $state('Starting editor…');
  let recovery = $state<RecoveryRecord | null>(null);
  let recoveryError = $state('');
  let recoveryOverview = $state<RecoveryOverview>({ current: null, backupCount: 0, latestSavedAt: null });
  let localDataOpen = $state(false);
  let clearingRecovery = $state(false);
  let localDataMessage = $state('');
  let isClearingRecovery = false;
  let changedDuringClear = false;
  let storageQueue: Promise<void> = Promise.resolve();
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let latestProject: ProjectSnapshot | null = null;
  let serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
  let updateAvailable = $state(false);
  let updateBusy = $state(false);
  let updateError = $state('');
  let pendingStateCapture: ((project: ProjectSnapshot) => void) | null = null;
  let reloadAfterControllerChange = false;

  function queueStorageTask<T>(operation: () => Promise<T>): Promise<T> {
    const task = storageQueue.then(operation, operation);
    storageQueue = task.then(() => undefined, () => undefined);
    return task;
  }

  async function refreshRecoveryOverview(): Promise<void> {
    try {
      recoveryOverview = await getRecoveryOverview();
      localDataMessage = '';
    } catch {
      localDataMessage = 'Recovery details are unavailable in this browser.';
    }
  }

  function scheduleAutosave(project: ProjectSnapshot): void {
    latestProject = project;
    saveStatus = 'Unsaved changes';
    if (isClearingRecovery) {
      changedDuringClear = true;
      return;
    }
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      if (!latestProject || isClearingRecovery) return;
      const snapshot = latestProject;
      void queueStorageTask(() => persistProject(snapshot))
        .then(() => {
          saveStatus = 'Saved locally · ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          recoveryError = '';
          void refreshRecoveryOverview();
        })
        .catch((error) => {
          saveStatus = 'Local save unavailable';
          recoveryError = error instanceof Error && /quota/i.test(error.name + error.message)
            ? 'Browser storage is full. Export a .pfs project to keep a separate copy.'
            : 'The browser could not save this project. Export a .pfs project as a backup.';
        });
    }, 2500);
  }

  async function checkForRecovery(): Promise<void> {
    try {
      const overview = await getRecoveryOverview();
      recoveryOverview = overview;
      if (isProjectSnapshot(overview.current?.project)) {
        recovery = overview.current;
        saveStatus = 'A local recovery is available';
      }
    } catch {
      saveStatus = 'Local storage unavailable';
      recoveryError = 'This browser could not open local recovery storage.';
      localDataMessage = 'Recovery details are unavailable in this browser.';
    }
  }

  async function clearSavedRecovery(): Promise<void> {
    const confirmed = window.confirm(
      'Clear the latest autosave and all retained recovery copies from this browser? The canvas currently open will remain in memory, but saved recovery cannot be restored after deletion. Export a .pfs project first if you need a separate copy.'
    );
    if (!confirmed) return;

    clearingRecovery = true;
    isClearingRecovery = true;
    changedDuringClear = false;
    localDataMessage = '';
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = undefined;

    try {
      await queueStorageTask(() => clearRecoveryData());
      recovery = null;
      recoveryOverview = await getRecoveryOverview();
      recoveryError = '';
      saveStatus = 'Saved recovery cleared · current canvas remains open';
      localDataMessage = 'Saved autosave and recovery copies were removed. The open canvas and offline app files were not changed.';
    } catch {
      localDataMessage = 'The browser could not clear local recovery. Your existing saved copies were not intentionally changed.';
    } finally {
      clearingRecovery = false;
      isClearingRecovery = false;
      if (changedDuringClear && latestProject) {
        changedDuringClear = false;
        scheduleAutosave(latestProject);
      }
    }
  }

  function restoreRecovery(): void {
    if (!recovery) return;
    saveStatus = 'Restoring local project…';
    window.postMessage({ type: 'PIXELFORGE_RESTORE', project: recovery.project }, window.location.origin);
  }

  function handleEditorReady(): void {
    saveStatus = 'Editor ready · local-only storage';
    void checkForRecovery();
  }

  function handleEditorState(event: Event): void {
    const message = (event as CustomEvent<{ type: string; project: ProjectSnapshot }>).detail;
    if (message?.type !== 'PIXELFORGE_STATE' || !isProjectSnapshot(message.project)) return;
    const project = message.project;
    latestProject = project;
    if (pendingStateCapture) {
      const resolve = pendingStateCapture;
      pendingStateCapture = null;
      resolve(project);
    } else {
      scheduleAutosave(project);
    }
  }

  function handleEditorRestored(): void {
    recovery = null;
    saveStatus = 'Recovered · saving locally…';
    if (latestProject) scheduleAutosave(latestProject);
  }

  function captureCurrentProject(): Promise<ProjectSnapshot> {
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        pendingStateCapture = null;
        reject(new Error('The editor did not respond with its latest project state.'));
      }, 3000);
      pendingStateCapture = (project) => {
        window.clearTimeout(timeout);
        resolve(project);
      };
      window.postMessage({ type: 'PIXELFORGE_REQUEST_STATE' }, window.location.origin);
    });
  }

  async function applyAvailableUpdate(): Promise<void> {
    const waiting = serviceWorkerRegistration?.waiting;
    if (!waiting) return;
    updateBusy = true;
    updateError = '';
    saveStatus = 'Saving project before update…';
    try {
      const project = await captureCurrentProject();
      if (saveTimer) clearTimeout(saveTimer);
      latestProject = project;
      await queueStorageTask(() => persistProject(project));
      saveStatus = 'Project saved · applying update';
      reloadAfterControllerChange = true;
      waiting.postMessage({ type: 'SKIP_WAITING' });
    } catch (error) {
      updateBusy = false;
      saveStatus = 'Update paused · project not confirmed saved';
      updateError = error instanceof Error ? error.message : 'Could not save the current project before updating.';
    }
  }

  async function registerServiceWorker(): Promise<(() => void) | undefined> {
    if (!('serviceWorker' in navigator)) return undefined;
    try {
      serviceWorkerRegistration = await navigator.serviceWorker.register('/service-worker.js');
      const checkForUpdate = () => {
        if (document.visibilityState === 'visible') {
          void serviceWorkerRegistration?.update().catch(() => undefined);
        }
      };
      const onUpdateFound = () => {
        const installing = serviceWorkerRegistration?.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller) {
            updateAvailable = true;
          }
        });
      };
      serviceWorkerRegistration.addEventListener('updatefound', onUpdateFound);
      if (serviceWorkerRegistration.waiting && navigator.serviceWorker.controller) updateAvailable = true;
      document.addEventListener('visibilitychange', checkForUpdate);
      checkForUpdate();
      return () => {
        serviceWorkerRegistration?.removeEventListener('updatefound', onUpdateFound);
        document.removeEventListener('visibilitychange', checkForUpdate);
      };
    } catch {
      saveStatus = 'Editor ready · offline updates unavailable';
      return undefined;
    }
  }

  function dismissRecovery(): void { recovery = null; }
  onMount(() => {
    let removeUpdateListeners: (() => void) | undefined;
    const onControllerChange = () => {
      if (reloadAfterControllerChange) window.location.reload();
    };
    window.addEventListener('pixelforge:ready', handleEditorReady);
    window.addEventListener('pixelforge:state', handleEditorState);
    window.addEventListener('pixelforge:restored', handleEditorRestored);
    navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange);
    void registerServiceWorker().then((cleanup) => { removeUpdateListeners = cleanup; });
    return () => {
      window.removeEventListener('pixelforge:ready', handleEditorReady);
      window.removeEventListener('pixelforge:state', handleEditorState);
      window.removeEventListener('pixelforge:restored', handleEditorRestored);
      navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange);
      removeUpdateListeners?.();
      if (saveTimer) clearTimeout(saveTimer);
    };
  });
</script>

<svelte:head>
  <title>PixelForge Studio 2.4 — Image Editor</title>
  <meta name="description" content="A mobile-friendly, offline-first image editor with layers, masks and local project recovery." />
</svelte:head>

<main class="relative h-dvh min-h-[320px] w-screen overflow-hidden bg-[#17191d]">
  <EditorWorkbench />

  <div class="pointer-events-none fixed bottom-[34px] left-3 z-40 max-w-[calc(100vw-24px)] rounded-lg border border-white/10 bg-[#202329]/95 px-3 py-2 text-[11px] text-slate-300 shadow-xl backdrop-blur"
    role="status" aria-live="polite">
    <span class="mr-2 inline-block size-2 rounded-full bg-emerald-400" aria-hidden="true"></span>{saveStatus}
  </div>
  <button
    type="button"
    class="fixed bottom-[82px] right-3 z-40 min-h-10 rounded-lg border border-white/15 bg-[#202329]/95 px-3 text-xs font-semibold text-slate-100 shadow-xl backdrop-blur hover:bg-[#2a3039] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-300"
    aria-expanded={localDataOpen}
    aria-controls="local-data-panel"
    onclick={() => { localDataOpen = !localDataOpen; if (localDataOpen) void refreshRecoveryOverview(); }}
  >Manage local recovery</button>

  {#if localDataOpen}
    <section id="local-data-panel" class="fixed bottom-[130px] right-3 z-50 w-[min(360px,calc(100vw-24px))] rounded-xl border border-white/15 bg-[#202733] p-4 text-slate-100 shadow-2xl" aria-labelledby="local-data-title">
      <div class="flex items-center justify-between gap-3">
        <h2 id="local-data-title" class="text-sm font-semibold">Local recovery data</h2>
        <button type="button" class="min-h-9 rounded-lg px-2 text-xs text-slate-300 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-blue-300" onclick={() => localDataOpen = false}>Close</button>
      </div>
      <p class="mt-2 text-xs leading-5 text-slate-300">PixelForge keeps project recovery snapshots in IndexedDB on this device. They are not uploaded to a PixelForge account or cloud sync.</p>
      <dl class="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-black/20 p-3 text-xs">
        <dt class="text-slate-400">Latest autosave</dt>
        <dd class="text-right font-medium">{recoveryOverview.current ? new Date(recoveryOverview.current.savedAt).toLocaleString() : 'None found'}</dd>
        <dt class="text-slate-400">Recovery copies</dt>
        <dd class="text-right font-medium">{recoveryOverview.backupCount}</dd>
      </dl>
      {#if localDataMessage}
        <p class="mt-3 text-xs leading-5 text-slate-300" role="status" aria-live="polite">{localDataMessage}</p>
      {/if}
      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" class="min-h-10 rounded-lg border border-white/15 px-3 text-xs text-slate-200 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-blue-300" onclick={refreshRecoveryOverview} disabled={clearingRecovery}>Refresh</button>
        <button type="button" class="min-h-10 rounded-lg border border-red-300/30 bg-red-500/10 px-3 text-xs font-semibold text-red-100 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-red-200" onclick={clearSavedRecovery} disabled={clearingRecovery || (!recoveryOverview.current && recoveryOverview.backupCount === 0)}>
          {clearingRecovery ? 'Clearing…' : 'Clear saved recovery'}
        </button>
      </div>
      <p class="mt-3 text-[11px] leading-5 text-slate-400">Clearing removes the latest autosave and retained recovery copies only. The canvas currently open and the offline app cache are unaffected. Export a .pfs project before clearing anything you may need again. New edits will create fresh recovery data.</p>
    </section>
  {/if}

  {#if recovery}
    <section class="fixed left-1/2 top-14 z-50 w-[min(440px,calc(100vw-24px))] -translate-x-1/2 rounded-xl border border-blue-300/20 bg-[#202733] p-4 text-slate-100 shadow-2xl" aria-labelledby="recovery-title">
      <div class="flex items-start gap-3">
        <div class="grid size-9 shrink-0 place-items-center rounded-lg bg-blue-400/15 text-blue-200" aria-hidden="true">↻</div>
        <div class="min-w-0 flex-1">
          <h2 id="recovery-title" class="text-sm font-semibold">Recover your last project?</h2>
          <p class="mt-1 text-xs leading-5 text-slate-300">A locally saved project from {new Date(recovery.savedAt).toLocaleString()} is available on this device.</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button class="min-h-10 rounded-lg bg-blue-500 px-3 text-xs font-semibold text-white transition hover:bg-blue-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-200" onclick={restoreRecovery}>Restore project</button>
            <button class="min-h-10 rounded-lg border border-white/15 px-3 text-xs font-medium text-slate-200 transition hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-200" onclick={dismissRecovery}>Start with current canvas</button>
          </div>
        </div>
      </div>
    </section>
  {/if}

  {#if updateAvailable}
    <section class="fixed right-3 top-3 z-50 w-[min(390px,calc(100vw-24px))] rounded-xl border border-blue-300/20 bg-[#202733] p-3 text-slate-100 shadow-2xl" aria-labelledby="update-title">
      <div class="flex items-start gap-3">
        <span class="grid size-8 shrink-0 place-items-center rounded-lg bg-blue-400/15 text-blue-200" aria-hidden="true">↑</span>
        <div class="min-w-0 flex-1">
          <h2 id="update-title" class="text-sm font-semibold">PixelForge update available</h2>
          <p class="mt-1 text-xs leading-5 text-slate-300">Save your current project locally before refreshing to the latest version.</p>
          {#if updateError}<p class="mt-2 text-xs text-amber-200">{updateError}</p>{/if}
          <div class="mt-3 flex flex-wrap gap-2">
            <button class="min-h-10 rounded-lg bg-blue-500 px-3 text-xs font-semibold text-white transition hover:bg-blue-400 disabled:opacity-60" onclick={applyAvailableUpdate} disabled={updateBusy}>
              {updateBusy ? 'Saving and updating…' : 'Save and update'}
            </button>
            <button class="min-h-10 rounded-lg border border-white/15 px-3 text-xs text-slate-200 hover:bg-white/5" onclick={() => updateAvailable = false} disabled={updateBusy}>Later</button>
          </div>
        </div>
      </div>
    </section>
  {/if}

  {#if recoveryError}
    <div class="fixed bottom-16 left-3 z-40 max-w-[min(420px,calc(100vw-24px))] rounded-lg border border-amber-300/20 bg-[#332b20] px-3 py-2 text-xs leading-5 text-amber-100 shadow-xl">{recoveryError}</div>
  {/if}
</main>
