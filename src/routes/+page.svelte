<script lang="ts">
  import { onMount } from 'svelte';
  import EditorWorkbench from '$lib/editor/EditorWorkbench.svelte';
  type ProjectSnapshot = { format: 'PixelForgeProject'; version: number; w: number; h: number; name: string; activeId: string | null; layers: unknown[]; [key: string]: unknown };
  type RecoveryRecord = { id: string; savedAt: number; project: ProjectSnapshot };
  let saveStatus = $state('Starting editor…');
  let recovery = $state<RecoveryRecord | null>(null);
  let recoveryError = $state('');
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let latestProject: ProjectSnapshot | null = null;
  let database: Promise<IDBDatabase> | null = null;
  let serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
  let updateAvailable = $state(false);
  let updateBusy = $state(false);
  let updateError = $state('');
  let pendingStateCapture: ((project: ProjectSnapshot) => void) | null = null;
  let reloadAfterControllerChange = false;
  const DB_NAME = 'pixelforge-studio-local';
  const STORE_NAME = 'snapshots';

  function openDatabase(): Promise<IDBDatabase> {
    if (database) return database;
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open local storage.'));
      request.onblocked = () => reject(new Error('Local storage upgrade is blocked by another tab.'));
    });
    return database;
  }

  function requestResult<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Local storage request failed.'));
    });
  }

  async function getCurrentRecovery(): Promise<RecoveryRecord | null> {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readonly');
    return (await requestResult(tx.objectStore(STORE_NAME).get('current'))) ?? null;
  }

  async function persistProject(project: ProjectSnapshot): Promise<void> {
    const db = await openDatabase();
    const savedAt = Date.now();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put({ id: 'current', savedAt, project } satisfies RecoveryRecord);
    store.put({ id: 'backup-' + savedAt, savedAt, project } satisfies RecoveryRecord);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Local autosave failed.'));
      tx.onabort = () => reject(tx.error ?? new Error('Local autosave was cancelled.'));
    });

    const readTx = db.transaction(STORE_NAME, 'readonly');
    const all = await requestResult(readTx.objectStore(STORE_NAME).getAll()) as RecoveryRecord[];
    const backups = all.filter((record) => record.id.startsWith('backup-')).sort((a, b) => b.savedAt - a.savedAt);
    if (backups.length > 3) {
      const cleanup = db.transaction(STORE_NAME, 'readwrite');
      backups.slice(3).forEach((record) => cleanup.objectStore(STORE_NAME).delete(record.id));
      await new Promise<void>((resolve, reject) => {
        cleanup.oncomplete = () => resolve();
        cleanup.onerror = () => reject(cleanup.error ?? new Error('Could not clean old recovery copies.'));
      });
    }
  }

  function scheduleAutosave(project: ProjectSnapshot): void {
    latestProject = project;
    saveStatus = 'Unsaved changes';
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      if (!latestProject) return;
      try {
        await persistProject(latestProject);
        saveStatus = 'Saved locally · ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        recoveryError = '';
      } catch (error) {
        saveStatus = 'Local save unavailable';
        recoveryError = error instanceof Error && /quota/i.test(error.name + error.message)
          ? 'Browser storage is full. Export a .pfs project to keep a separate copy.'
          : 'The browser could not save this project. Export a .pfs project as a backup.';
      }
    }, 2500);
  }

  async function checkForRecovery(): Promise<void> {
    try {
      const saved = await getCurrentRecovery();
      if (saved?.project?.format === 'PixelForgeProject') {
        recovery = saved;
        saveStatus = 'A local recovery is available';
      }
    } catch {
      saveStatus = 'Local storage unavailable';
      recoveryError = 'This browser could not open local recovery storage.';
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
    if (message?.type !== 'PIXELFORGE_STATE' || message.project?.format !== 'PixelForgeProject') return;
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
      await persistProject(project);
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
  <title>PixelForge Studio 2.3 — Image Editor</title>
  <meta name="description" content="A mobile-friendly, offline-first image editor with layers, masks and local project recovery." />
</svelte:head>

<main class="relative h-dvh min-h-[320px] w-screen overflow-hidden bg-[#17191d]">
  <EditorWorkbench />

  <div class="pointer-events-none fixed bottom-[34px] left-3 z-40 max-w-[calc(100vw-24px)] rounded-lg border border-white/10 bg-[#202329]/95 px-3 py-2 text-[11px] text-slate-300 shadow-xl backdrop-blur"
    role="status" aria-live="polite">
    <span class="mr-2 inline-block size-2 rounded-full bg-emerald-400" aria-hidden="true"></span>{saveStatus}
  </div>

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
